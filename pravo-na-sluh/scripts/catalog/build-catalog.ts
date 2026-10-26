// npm run catalog:build
// Собирает content/catalog/documents.json из редакционного списка (catalog-source.json) и
// результатов сверки с ИПС «Законодательство России» (ips-verification.json).
// Документ без подтверждения в ИПС получает verifiedAt = null и предупреждение в карточке.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'content/catalog');

interface SourceEntry {
  id: string;
  category: string;
  docType: string;
  shortTitle: string;
  description: string;
  popularity: number;
  /** Запрос к ИПС: дата принятия и номер. */
  ips?: { date: string; number: string; nd?: string };
  /** Поля, заданные вручную (Конституция). */
  manual?: Record<string, unknown>;
}

interface IpsFound { nd: string; status: string; requisites: string; title: string; publication: string }
interface IpsResult { id: string; date: string; number: string; found: IpsFound[] }

const source: { checkedAt: string; documents: SourceEntry[] } = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog-source.json'), 'utf8'));
const ips: IpsResult[] = JSON.parse(fs.readFileSync(path.join(DIR, 'ips-verification.json'), 'utf8')).results;

const toIso = (d: string) => d.split('.').reverse().join('-');

const docs = source.documents.map((s, i) => {
  if (s.manual) return { id: s.id, category: s.category, docType: s.docType, shortTitle: s.shortTitle, description: s.description, popularity: s.popularity, sort: i, ...s.manual };
  const r = ips.find((x) => x.id === s.id);
  const hit = r?.found.find((f) => (s.ips?.nd ? f.nd === s.ips.nd : f.requisites.includes(`от ${s.ips!.date}`)));
  if (!hit) {
    console.warn(`! ${s.id}: не подтверждён в ИПС — карточка будет помечена «реквизиты не проверены»`);
    return { id: s.id, category: s.category, docType: s.docType, shortTitle: s.shortTitle, title: s.shortTitle, description: s.description, popularity: s.popularity, sort: i,
      number: s.ips?.number ?? null, adoptedAt: s.ips ? toIso(s.ips.date) : null, publication: null, status: 'unknown', statusNote: 'Реквизиты и статус не проверены по официальному источнику',
      officialUrl: null, sourceName: null, verifiedAt: null, verificationNote: null };
  }
  const number = hit.requisites.match(/№\s*(.+)$/)?.[1]?.trim() ?? s.ips!.number;
  return {
    id: s.id,
    category: s.category,
    docType: s.docType,
    shortTitle: s.shortTitle,
    title: s.docType === 'Кодекс' ? hit.title : `${hit.requisites.replace(/ от .*/, '')} «${hit.title}»`,
    fullRequisites: `${hit.requisites} «${hit.title}»`,
    description: s.description,
    number,
    adoptedAt: toIso(s.ips!.date),
    publication: hit.publication.replace(/ г\. /g, ' г. ').replace(/\s+,/g, ','),
    status: /^Действует/.test(hit.status) ? 'in_force' : /Утратил/.test(hit.status) ? 'repealed' : 'unknown',
    statusNote: `${hit.status} — по данным ИПС «Законодательство России» на ${source.checkedAt.split('-').reverse().join('.')}`,
    officialUrl: `http://pravo.gov.ru/proxy/ips/?docbody=&nd=${hit.nd}`,
    sourceName: 'Официальный интернет-портал правовой информации (pravo.gov.ru), ИПС «Законодательство России»',
    verifiedAt: source.checkedAt,
    verificationNote: 'Сверены реквизиты, наименование и статус действия. Текст документа в бета-версии не загружен — откройте официальный источник.',
    popularity: s.popularity,
    sort: i,
  };
});

fs.writeFileSync(path.join(DIR, 'documents.json'), JSON.stringify({ generatedAt: new Date().toISOString(), checkedAt: source.checkedAt, documents: docs }, null, 2) + '\n');
console.log(`Каталог: ${docs.length} документов, подтверждено в ИПС: ${docs.filter((d) => (d as { verifiedAt?: string | null }).verifiedAt).length}`);
