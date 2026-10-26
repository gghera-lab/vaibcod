import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, json, setup } from './helpers.ts';

describe('Каталог, Конституция, прогресс, запоминание', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  const h = auth({ id: 3001 });
  beforeAll(async () => { t = await setup(); }, 60_000);
  afterAll(async () => t.close());

  it('каталог: Конституция — единственный документ с аудио', async () => {
    const res = json(await t.app.inject({ method: 'GET', url: '/api/catalog' }));
    expect(res.total).toBeGreaterThanOrEqual(40);
    const withAudio = res.items.filter((d: { audioStatus: string }) => d.audioStatus === 'available');
    expect(withAudio.map((d: { id: string }) => d.id)).toEqual(['constitution-rf']);
  });

  it('поиск по номеру и названию', async () => {
    const byNumber = json(await t.app.inject({ method: 'GET', url: `/api/catalog?q=${encodeURIComponent('152-ФЗ')}` }));
    expect(byNumber.items.map((d: { id: string }) => d.id)).toContain('fz-152');
    const byName = json(await t.app.inject({ method: 'GET', url: `/api/catalog?q=${encodeURIComponent('трудовой')}` }));
    expect(byName.items[0].id).toBe('tk');
    const none = json(await t.app.inject({ method: 'GET', url: `/api/catalog?q=${encodeURIComponent('несуществующий документ')}` }));
    expect(none.total).toBe(0);
  });

  it('фильтр по категории', async () => {
    const res = json(await t.app.inject({ method: 'GET', url: '/api/catalog?category=codes' }));
    expect(res.items.every((d: { category: string }) => d.category === 'codes')).toBe(true);
  });

  it('документы каталога ссылаются на официальный источник', async () => {
    const res = json(await t.app.inject({ method: 'GET', url: '/api/catalog' }));
    for (const d of res.items) expect(d.officialUrl).toMatch(/^http:\/\/pravo\.gov\.ru\//);
  });

  it('голосование: не больше 3 голосов, нельзя голосовать за озвученную Конституцию', async () => {
    for (const id of ['gk-1', 'uk', 'tk']) {
      expect((await t.app.inject({ method: 'PUT', url: `/api/documents/${id}/vote`, headers: h, payload: { on: true } })).statusCode).toBe(200);
    }
    const fourth = await t.app.inject({ method: 'PUT', url: '/api/documents/nk-1/vote', headers: h, payload: { on: true } });
    expect(fourth.statusCode).toBe(400);
    const constitution = await t.app.inject({ method: 'PUT', url: '/api/documents/constitution-rf/vote', headers: h, payload: { on: true } });
    expect(constitution.statusCode).toBe(400);
  });

  it('заявка «сообщить о выходе аудио» сохраняется', async () => {
    const d = json(await t.app.inject({ method: 'PUT', url: '/api/documents/gk-2/notify', headers: h, payload: { on: true } }));
    expect(d.notify).toBe(true);
  });

  it('оглавление Конституции: 9 глав, раздел второй, 152 элемента', async () => {
    const toc = json(await t.app.inject({ method: 'GET', url: '/api/constitution' }));
    expect(toc.chapters.filter((c: { number: number | null }) => c.number).length).toBe(9);
    expect(toc.chapters.flatMap((c: { articles: unknown[] }) => c.articles).length).toBe(152);
    expect(toc.edition.key).toBe('2022-10-04');
  });

  it('статья 67.1 доступна по ключу, несуществующая — 404', async () => {
    const a = json(await t.app.inject({ method: 'GET', url: '/api/constitution/articles/art-67.1' }));
    expect(a.title).toBe('Статья 67¹');
    expect(a.units[0].text).toContain('правопреемником Союза ССР');
    expect((await t.app.inject({ method: 'GET', url: '/api/constitution/articles/art-999' })).statusCode).toBe(404);
  });

  it('плейлист: все треки и файл книги со смещениями', async () => {
    const pl = json(await t.app.inject({ method: 'GET', url: '/api/constitution/playlist' }));
    expect(pl.tracks.length).toBe(163);
    if (pl.status === 'ready') {
      expect(pl.book).not.toBeNull();
      expect(pl.tracks.every((x: { bookOffsetMs: number | null }) => x.bookOffsetMs != null)).toBe(true);
    }
  });

  it('поиск по тексту статей: фрагмент с совпадением, без учёта регистра и «ё»', async () => {
    const res = json(await t.app.inject({ method: 'GET', url: `/api/constitution/search?q=${encodeURIComponent('Отрешен от должности')}` }));
    const hit = res.items.find((h: { key: string }) => h.key === 'art-93');
    expect(hit).toBeTruthy();
    expect(hit.match.toLowerCase().replace(/ё/g, 'е')).toBe('отрешен от должности');
    expect(`${hit.before}${hit.match}${hit.after}`).toContain(hit.match);
    expect(json(await t.app.inject({ method: 'GET', url: '/api/constitution/search?q=%D0%B0' })).items).toEqual([]);
    expect(json(await t.app.inject({ method: 'GET', url: `/api/constitution/search?q=${encodeURIComponent('%_%')}` })).items).toEqual([]);
  });

  it('скрытые голоса (hidden в voices.json) не попадают в плеер, даже если выбраны в настройках', async () => {
    const hidden = (JSON.parse(fs.readFileSync(path.join(t.config.CONTENT_DIR, 'voices.json'), 'utf8')).voices as { id: string; hidden?: boolean }[])
      .filter((v) => v.hidden).map((v) => v.id);
    const pl = json(await t.app.inject({ method: 'GET', url: '/api/constitution/playlist' }));
    expect(pl.voices.map((v: { id: string }) => v.id).filter((id: string) => hidden.includes(id))).toEqual([]);
    if (!hidden.length) return;
    const hv = auth({ id: 3002 });
    await t.app.inject({ method: 'GET', url: '/api/me', headers: hv });
    await t.app.inject({ method: 'PATCH', url: '/api/me/settings', headers: hv, payload: { voiceId: hidden[0] } });
    const mine = json(await t.app.inject({ method: 'GET', url: '/api/constitution/playlist', headers: hv }));
    expect(hidden).not.toContain(mine.voice?.id ?? null);
    const asked = json(await t.app.inject({ method: 'GET', url: `/api/constitution/playlist?voice=${hidden[0]}`, headers: hv }));
    expect(hidden).not.toContain(asked.voice?.id ?? null);
  });

  it('прогресс: перемотка не засчитывается, статья отмечается после 80% прослушивания', async () => {
    const pl = json(await t.app.inject({ method: 'GET', url: '/api/constitution/playlist' }));
    const art = pl.tracks.find((x: { key: string }) => x.key === 'art-2');
    const seek = json(await t.app.inject({ method: 'PUT', url: '/api/progress/constitution', headers: h, payload: { trackKey: 'art-2', positionMs: art.durationMs - 500, listenedDeltaMs: 0, event: 'seek' } }));
    expect(seek.completed).toBe(false);
    let last: { completed: boolean } = { completed: false };
    for (let ms = 0; ms < art.durationMs; ms += 5000) {
      last = json(await t.app.inject({ method: 'PUT', url: '/api/progress/constitution', headers: h, payload: { trackKey: 'art-2', positionMs: ms, listenedDeltaMs: 5000, event: 'tick' } }));
    }
    expect(last.completed).toBe(true);
    const p = json(await t.app.inject({ method: 'GET', url: '/api/progress/constitution', headers: h }));
    expect(p.progress.trackKey).toBe('art-2');
    const stats = json(await t.app.inject({ method: 'GET', url: '/api/me/stats', headers: h }));
    expect(stats.articlesCompleted).toBe(1);
  });

  it('прогресс: за один запрос засчитывается не больше 2 минут', async () => {
    const before = json(await t.app.inject({ method: 'GET', url: '/api/me/stats', headers: h })).listenedMs;
    await t.app.inject({ method: 'PUT', url: '/api/progress/constitution', headers: h, payload: { trackKey: 'art-1', positionMs: 1000, listenedDeltaMs: 3_000_000 } });
    const after = json(await t.app.inject({ method: 'GET', url: '/api/me/stats', headers: h })).listenedMs;
    expect(after - before).toBe(120_000);
  });

  it('карточки: верный и неверный ответ, цитата и источник в разборе', async () => {
    const q = json(await t.app.inject({ method: 'GET', url: '/api/memory/queue?mode=article&key=art-2', headers: h }));
    const tf = q.cards.find((c: { type: string }) => c.type === 'truefalse');
    expect(tf.prompt).toContain('обязанность государства');
    const ok = json(await t.app.inject({ method: 'POST', url: `/api/memory/cards/${tf.id}/answer`, headers: h, payload: { answer: { value: true }, confidence: 3 } }));
    expect(ok.correct).toBe(true);
    expect(ok.quote).toContain('обязанность государства');
    expect(ok.sourceRef).toBe('ст. 2 Конституции РФ');
    expect(ok.intervalDays).toBeGreaterThan(1);
    const bad = json(await t.app.inject({ method: 'POST', url: `/api/memory/cards/${tf.id}/answer`, headers: h, payload: { answer: { value: false }, confidence: 3 } }));
    expect(bad.correct).toBe(false);
    expect(bad.intervalDays).toBeLessThan(0.01);
  });

  it('карточки Pro недоступны без подписки', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/memory/cards/a80-1/answer', headers: h, payload: { answer: { index: 0 } } });
    expect(res.statusCode).toBe(402);
    const quiz = await t.app.inject({ method: 'POST', url: '/api/quiz', headers: h, payload: { scope: 'chapter', key: 'ch-4' } });
    expect(quiz.statusCode).toBe(402);
  });

  it('тест по главе 1: старт, ответы, результат; чужой тест недоступен', async () => {
    const quiz = json(await t.app.inject({ method: 'POST', url: '/api/quiz', headers: h, payload: { scope: 'chapter', key: 'ch-1' } }));
    expect(quiz.cards.length).toBeGreaterThan(0);
    expect(quiz.cards[0]).not.toHaveProperty('answer');
    const foreign = await t.app.inject({ method: 'POST', url: `/api/quiz/${quiz.attemptId}/answer`, headers: auth({ id: 3999 }), payload: { cardId: quiz.cards[0].id, answer: { index: 0 } } });
    expect(foreign.statusCode).toBe(404);
    for (const c of quiz.cards) {
      const answer = c.type === 'truefalse' ? { value: true } : c.type === 'cloze' ? { text: 'ответ' } : { index: 0 };
      expect((await t.app.inject({ method: 'POST', url: `/api/quiz/${quiz.attemptId}/answer`, headers: h, payload: { cardId: c.id, answer } })).statusCode).toBe(200);
    }
    const fin = json(await t.app.inject({ method: 'POST', url: `/api/quiz/${quiz.attemptId}/finish`, headers: h }));
    expect(fin.answered).toBe(quiz.cards.length);
    expect(fin.pct).toBeGreaterThanOrEqual(0);
    const overview = json(await t.app.inject({ method: 'GET', url: '/api/memory/overview', headers: h }));
    expect(overview.history.length).toBeGreaterThan(0);
  });

  it('некорректные данные отклоняются валидацией', async () => {
    const res = await t.app.inject({ method: 'PUT', url: '/api/progress/constitution', headers: h, payload: { trackKey: 'art-1', positionMs: -5 } });
    expect(res.statusCode).toBe(400);
    expect(json(res).error.code).toBe('validation');
  });

  it('удаление аккаунта стирает данные пользователя', async () => {
    const u = auth({ id: 3500 });
    await t.app.inject({ method: 'PUT', url: '/api/documents/gk-1/favorite', headers: u, payload: { on: true } });
    expect((await t.app.inject({ method: 'DELETE', url: '/api/me', headers: u, payload: { confirm: 'нет' } })).statusCode).toBe(400);
    expect((await t.app.inject({ method: 'DELETE', url: '/api/me', headers: u, payload: { confirm: 'УДАЛИТЬ' } })).statusCode).toBe(200);
    const fav = json(await t.app.inject({ method: 'GET', url: '/api/favorites', headers: u }));
    expect(fav.documents.length).toBe(0);
  });
});
