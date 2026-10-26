// npm run finance:model — финансовая модель на 12 месяцев в трёх сценариях.
// ВСЕ числа — гипотезы для проверки (кроме цен тарифов из content/tariffs.json и тарифов SpeechKit).
// Меняйте допущения ниже и перезапускайте: результат пишется в docs/finance-model.md.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const tariffs = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/tariffs.json'), 'utf8')).products as { id: string; priceStars: number }[];
const MONTH = tariffs.find((t) => t.id === 'pro_month')!.priceStars;
const YEAR = tariffs.find((t) => t.id === 'pro_year')!.priceStars;

interface Scenario {
  name: string;
  newUsers: number; // новых пользователей в 1-й месяц
  growth: number; // рост притока в месяц
  activation: number; // доля новых, прослушавших хотя бы одну статью
  activeRetention: number; // доля активных, остающихся активными в следующем месяце
  conversion: number; // доля активных бесплатных, покупающих Pro за месяц
  yearlyShare: number; // доля покупок годового тарифа
  paidChurn: number; // отток месячных подписчиков
  marketing: number; // ₽ в месяц
  team: number; // ₽ в месяц: поддержка, редактура, юрист (частичная занятость)
}

const COMMON = {
  rubPerStar: 1.0, // чистые ₽ за Star после вывода (≈$0,013 по сторонним источникам, минус комиссии конвертации) — гипотеза
  tax: 0.06, // УСН «доходы» / НПД — уточнить с бухгалтером
  hosting: 6000, // сервер в РФ + управляемый PostgreSQL + хранилище/CDN — гипотеза
  tools: 1000, // домен, мониторинг, почта
  newAudiobookEvery: 2, // месяцев между выпусками новых аудиокниг, начиная с 3-го месяца
  audiobookCost: 26000, // SpeechKit ≈ 1 000 ₽ + вычитка произношения и юр. редактура ≈ 25 000 ₽ — гипотеза
};

const SCENARIOS: Scenario[] = [
  { name: 'Консервативный', newUsers: 300, growth: 0.1, activation: 0.35, activeRetention: 0.4, conversion: 0.015, yearlyShare: 0.15, paidChurn: 0.15, marketing: 20000, team: 15000 },
  { name: 'Базовый', newUsers: 800, growth: 0.15, activation: 0.45, activeRetention: 0.5, conversion: 0.03, yearlyShare: 0.2, paidChurn: 0.12, marketing: 50000, team: 25000 },
  { name: 'Оптимистичный', newUsers: 2000, growth: 0.2, activation: 0.55, activeRetention: 0.6, conversion: 0.05, yearlyShare: 0.25, paidChurn: 0.08, marketing: 120000, team: 40000 },
];

const rub = (n: number) => Math.round(n).toLocaleString('ru-RU');

function run(s: Scenario) {
  let active = 0, monthly = 0, cumulative = 0;
  const yearlyActive: number[] = [];
  const rows = [];
  let breakEven: number | null = null;
  for (let m = 1; m <= 12; m++) {
    const newUsers = s.newUsers * Math.pow(1 + s.growth, m - 1);
    active = active * s.activeRetention + newUsers * s.activation;
    const buyers = active * s.conversion;
    const newYearly = buyers * s.yearlyShare;
    const newMonthly = buyers - newYearly;
    monthly = monthly * (1 - s.paidChurn) + newMonthly;
    yearlyActive.push(newYearly);
    const paying = monthly + yearlyActive.slice(-12).reduce((a, b) => a + b, 0);
    const stars = monthly * MONTH + newYearly * YEAR;
    const revenue = stars * COMMON.rubPerStar;
    const content = m >= 3 && (m - 3) % COMMON.newAudiobookEvery === 0 ? COMMON.audiobookCost : 0;
    const costs = revenue * COMMON.tax + COMMON.hosting + COMMON.tools + s.marketing + s.team + content;
    const profit = revenue - costs;
    cumulative += profit;
    if (breakEven == null && profit >= 0) breakEven = m;
    rows.push({ m, newUsers, active, paying, revenue, costs, profit, cumulative });
  }
  const fixed = COMMON.hosting + COMMON.tools + s.marketing + s.team + COMMON.audiobookCost / COMMON.newAudiobookEvery;
  const arppu = ((1 - s.yearlyShare) * MONTH + (s.yearlyShare * YEAR) / 12) * COMMON.rubPerStar * (1 - COMMON.tax);
  return { rows, breakEven, payingForBreakEven: Math.ceil(fixed / arppu), arppu, fixed };
}

const out: string[] = [
  '# Финансовая модель на 12 месяцев', '',
  '> Сгенерировано скриптом `npm run finance:model`. **Все показатели — гипотезы**, кроме цен тарифов (content/tariffs.json) и тарифов SpeechKit. До запуска фактических данных о конверсии и удержании нет.', '',
  '## Общие допущения', '',
  '| Параметр | Значение | Статус |', '|---|---|---|',
  `| Цена Pro · месяц | ${MONTH} ⭐ | решение (тариф) |`,
  `| Цена Pro · год | ${YEAR} ⭐ | решение (тариф) |`,
  `| Чистые ₽ за 1 Star | ${COMMON.rubPerStar} ₽ | гипотеза: выплата ≈ $0,013/Star по сторонним источникам, вывод через Fragment в TON, удержание 21 день |`,
  `| Налог | ${COMMON.tax * 100}% от выручки | гипотеза — уточнить режим налогообложения |`,
  `| Хостинг и инфраструктура | ${rub(COMMON.hosting)} ₽/мес | гипотеза |`,
  `| Инструменты | ${rub(COMMON.tools)} ₽/мес | гипотеза |`,
  `| Новая аудиокнига | каждые ${COMMON.newAudiobookEvery} мес. с 3-го месяца, ${rub(COMMON.audiobookCost)} ₽ | синтез — по тарифу SpeechKit (факт), вычитка — гипотеза |`, '',
];

for (const s of SCENARIOS) {
  const r = run(s);
  out.push(`## ${s.name}`, '',
    `Приток в 1-й месяц: ${s.newUsers} (+${s.growth * 100}%/мес) · активация ${s.activation * 100}% · удержание активных ${s.activeRetention * 100}% · конверсия ${s.conversion * 100}%/мес · годовой тариф ${s.yearlyShare * 100}% покупок · отток подписчиков ${s.paidChurn * 100}%/мес · маркетинг ${rub(s.marketing)} ₽ · команда ${rub(s.team)} ₽ — **гипотезы**`, '',
    '| Мес | Новые | Активные | Платящие | Выручка, ₽ | Расходы, ₽ | Прибыль, ₽ | Накопленно, ₽ |', '|---|---|---|---|---|---|---|---|',
    ...r.rows.map((x) => `| ${x.m} | ${rub(x.newUsers)} | ${rub(x.active)} | ${rub(x.paying)} | ${rub(x.revenue)} | ${rub(x.costs)} | ${rub(x.profit)} | ${rub(x.cumulative)} |`), '',
    `- Месячная точка безубыточности: ${r.breakEven ? `${r.breakEven}-й месяц` : 'не достигается за 12 месяцев'}`,
    `- Средний чистый доход на платящего (после налога): ${rub(r.arppu)} ₽/мес`,
    `- Нужно платящих для покрытия постоянных расходов ${rub(r.fixed)} ₽/мес: **${r.payingForBreakEven}**`, '');
}
out.push('## Как пользоваться', '', '1. После запуска замените гипотезы фактическими значениями из метрик (Профиль → Метрики продукта или `/api/admin/metrics`).',
  '2. Главные рычаги: конверсия в оплату, отток подписчиков и стоимость привлечения. Цена тарифа меняется в content/tariffs.json без изменения интерфейса.',
  '3. Для прибыли P ₽/мес нужно платящих: (постоянные расходы + P) / доход на платящего.', '');
fs.writeFileSync(path.join(ROOT, 'docs/finance-model.md'), out.join('\n'));
console.log(out.filter((l) => l.startsWith('- Месячная') || l.startsWith('## ') || l.startsWith('- Нужно')).join('\n'));
