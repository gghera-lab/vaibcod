import { describe, expect, it } from 'vitest';
import { applyLexicon, cardinal, dateGenitive, displayNumber, gradeFromAnswer, labelNumber, letterName, newState, ordinal, plainForCompare, schedule, type Lexicon } from '../src/index.ts';

describe('Числа прописью', () => {
  it('количественные', () => {
    expect(cardinal(1)).toBe('один');
    expect(cardinal(21)).toBe('двадцать один');
    expect(cardinal(137)).toBe('сто тридцать семь');
    expect(cardinal(450)).toBe('четыреста пятьдесят');
    expect(cardinal(1000)).toBe('тысяча');
    expect(cardinal(2022)).toBe('две тысячи двадцать два');
  });
  it('порядковые и даты', () => {
    expect(ordinal(1, 'f')).toBe('первая');
    expect(ordinal(3, 'f')).toBe('третья');
    expect(ordinal(2, 'm')).toBe('второй');
    expect(ordinal(1993, 'm', 'gen')).toBe('тысяча девятьсот девяносто третьего');
    expect(ordinal(2020, 'm', 'gen')).toBe('две тысячи двадцатого');
    expect(ordinal(2000, 'm', 'gen')).toBe('двухтысячного');
    expect(dateGenitive(12, 12, 1993)).toBe('двенадцатого декабря тысяча девятьсот девяносто третьего года');
    expect(dateGenitive(4, 10, 2022)).toBe('четвёртого октября две тысячи двадцать второго года');
  });
  it('номера статей и пунктов', () => {
    expect(labelNumber('67.1')).toBe('шестьдесят семь точка один');
    expect(displayNumber('67.1')).toBe('67¹');
    expect(letterName('д.1', (n) => cardinal(n))).toBe('дэ точка один');
    expect(letterName('б', (n) => cardinal(n))).toBe('бэ');
  });
});

describe('Словарь произношения', () => {
  const lex: Lexicon = {
    yo: { ее: 'её', лишен: 'лишён' },
    stress: [{ pattern: 'орган(?=(?:ы|ов)?(?![а-яё]))', replace: 'о́рган' }],
    homographs: [{ word: 'права', default: 'права́', alt: { spoken: 'пра́ва', contexts: ['международного \\|'] } }],
    abbreviations: { ССР: 'эсэсэ́р' },
  };
  it('ё, ударения, омографы по контексту, не трогает «организация»', () => {
    const s = applyLexicon('Ее права и свободы; нормы международного права; органы и организация; Союз ССР; лишен', lex);
    expect(s).toContain('Её права́ и свободы');
    expect(s).toContain('международного пра́ва');
    expect(s).toContain('о́рганы и организация');
    expect(s).toContain('эсэсэ́р');
    expect(s).toContain('лишён');
  });
  it('сравнение без ударений и ё', () => {
    expect(plainForCompare('Её права́')).toBe('Ее права');
  });
});

describe('Интервальные повторения', () => {
  const now = new Date('2026-10-14T10:00:00Z');
  it('новая карточка: «хорошо» — через день, затем интервал растёт', () => {
    const s1 = schedule(newState(now), 3, now);
    expect(s1.intervalDays).toBeGreaterThan(0.9);
    expect(s1.intervalDays).toBeLessThan(1.2);
    const later = new Date(now.getTime() + 86400_000);
    const s2 = schedule(s1, 3, later);
    expect(s2.intervalDays).toBeGreaterThan(2);
    const s3 = schedule(s2, 3, new Date(later.getTime() + s2.intervalDays * 86400_000));
    expect(s3.intervalDays).toBeGreaterThan(s2.intervalDays * 2);
  });
  it('ошибка возвращает карточку через 10 минут и снижает лёгкость', () => {
    const s1 = schedule(schedule(newState(now), 3, now), 3, now);
    const fail = schedule(s1, 1, now);
    expect(fail.intervalDays * 24 * 60).toBeCloseTo(10, 0);
    expect(fail.ease).toBeLessThan(s1.ease);
    expect(fail.lapses).toBe(1);
  });
  it('сложные карточки повторяются чаще', () => {
    const easy = schedule(newState(now), 3, now, 1);
    const hard = schedule(newState(now), 3, now, 5);
    expect(hard.intervalDays).toBeLessThan(easy.intervalDays);
  });
  it('неверный ответ всегда «снова», уверенность влияет на оценку', () => {
    expect(gradeFromAnswer(false, 3)).toBe(1);
    expect(gradeFromAnswer(true, 1)).toBe(2);
    expect(gradeFromAnswer(true, 3)).toBe(4);
  });
  it('интервал не превышает года', () => {
    let s = newState(now);
    let t = now;
    for (let i = 0; i < 20; i++) { s = schedule(s, 4, t); t = new Date(t.getTime() + s.intervalDays * 86400_000); }
    expect(s.intervalDays).toBeLessThanOrEqual(365);
  });
});
