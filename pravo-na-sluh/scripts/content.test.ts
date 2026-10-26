// Проверки контента: полнота текста Конституции, сценарий озвучки, карточки, аудио-манифесты.

import fs from 'node:fs';
import path from 'node:path';
import type { AudioManifest, ConstitutionDocument, SpeechScript } from '@pravo/shared';
import { describe, expect, it } from 'vitest';
import { checkStructure } from './constitution/lib/checks.ts';
import { buildCards } from './constitution/lib/cards.ts';
import { buildScript, type BuildContext } from './constitution/lib/speech-builder.ts';
import { loadBuildInputs } from './constitution/build-script.ts';
import { parseMp3 } from './audio/lib/mp3.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const doc: ConstitutionDocument = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/constitution/constitution.json'), 'utf8'));

describe('Текст Конституции', () => {
  it('структура полная: 142 статьи, 9 глав, 9 пунктов раздела второго, статья 127 исключена', () => {
    const r = checkStructure(doc);
    expect(r.errors).toEqual([]);
    expect(doc.stats.articleCount).toBe(142);
    expect(doc.stats.finalPointCount).toBe(9);
  });
  it('сверка с kremlin.ru: необъяснённых расхождений нет', () => {
    const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/constitution/verification.json'), 'utf8'));
    expect(v.structureOk).toBe(true);
    expect(v.crossCheck.unexplained).toEqual([]);
    expect(v.crossCheck.missing).toEqual([]);
  });
  it('редакционные пометки не попали в текст норм', () => {
    for (const a of doc.articles) for (const u of a.units) expect(u.text).not.toMatch(/\(В редакции|\(Дополнение/);
  });
});

describe('Сценарий озвучивания', () => {
  const { lexicon, overrides, lexiconVersion } = loadBuildInputs();
  const ctx: BuildContext = { lexicon, overrides, used: new Map(), issues: [] };
  const script = buildScript(doc, ctx, lexiconVersion);
  it('нет ошибок сверки сценария с текстом нормы, все замены использованы', () => {
    expect(ctx.issues.filter((i) => i.level === 'error')).toEqual([]);
  });
  it('каждая единица текста озвучена ровно одним сегментом', () => {
    const units = doc.articles.flatMap((a) => a.units.map((u) => u.id));
    const voiced = script.tracks.flatMap((t) => t.segments.map((s) => s.unitId)).filter(Boolean);
    expect(new Set(voiced)).toEqual(new Set(units));
    expect(voiced.length).toBe(units.length);
  });
  it('в произносимом тексте нет цифр и надстрочных индексов', () => {
    for (const t of script.tracks) for (const s of t.segments) for (const p of s.pieces) expect(p.text).not.toMatch(/[0-9¹²³⁴⁵⁶⁷⁸⁹]/);
  });
  it('сохранённый сценарий совпадает со сборкой из текущих источников', () => {
    const saved: SpeechScript = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/constitution/speech/script.json'), 'utf8'));
    expect(saved.lexiconVersion).toBe(lexiconVersion);
    expect(saved.tracks.map((t) => t.segments.map((s) => s.pieces))).toEqual(script.tracks.map((t) => t.segments.map((s) => s.pieces)));
  });
});

describe('Карточки', () => {
  const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/constitution/cards-source.json'), 'utf8')).cards;
  const { cards, errors } = buildCards(doc, sources);
  it('все цитаты найдены дословно в тексте статей, правильные ответы подтверждены цитатой', () => {
    expect(errors).toEqual([]);
  });
  it('карточки «вспомни статью» есть для каждой действующей статьи', () => {
    const recall = cards.filter((c) => c.type === 'recall').map((c) => c.articleKey);
    const active = doc.articles.filter((a) => a.status !== 'excluded').map((a) => a.id);
    expect(new Set(recall)).toEqual(new Set(active));
  });
  it('бесплатные карточки — только преамбула и главы 1–2', () => {
    for (const c of cards) expect(c.tier === 'free').toBe(['preamble', 'ch-1', 'ch-2'].includes(c.chapterKey));
  });
});

describe('Аудио', () => {
  const base = path.join(ROOT, 'storage/audio/constitution', doc.editionId);
  const voices = fs.existsSync(base) ? fs.readdirSync(base) : [];
  it.skipIf(!voices.length)('манифест каждого голоса покрывает все треки сценария, файлы на месте и не повреждены', () => {
    const script: SpeechScript = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/constitution/speech/script.json'), 'utf8'));
    for (const v of voices) {
      const m: AudioManifest = JSON.parse(fs.readFileSync(path.join(base, v, 'manifest.json'), 'utf8'));
      expect(m.editionId).toBe(doc.editionId);
      expect(m.tracks.map((t) => t.id)).toEqual(script.tracks.map((t) => t.id));
      for (const t of m.tracks.slice(0, 20)) {
        const info = parseMp3(fs.readFileSync(path.join(base, v, t.file)));
        expect(info.badBytes).toBeLessThan(16);
        expect(Math.abs(info.durationMs - t.durationMs)).toBeLessThan(200);
      }
      expect(m.book).toBeTruthy();
      expect(Object.keys(m.book!.offsets).length).toBe(m.tracks.length);
    }
  });
});
