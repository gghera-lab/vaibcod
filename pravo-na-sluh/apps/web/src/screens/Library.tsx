// Библиотека: поиск по названию и номеру, категории, фильтры, сортировка.

import { CATEGORIES } from '@pravo/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CONSTITUTION_ID, DocCard, useListen } from '../components/DocCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { Empty, ErrorState, Sheet, Skeleton, TopBar } from '../components/ui.tsx';
import { track } from '../lib/analytics.ts';
import { plural } from '../lib/format.ts';
import { useCatalog, useCategories } from '../lib/hooks.ts';

const SORTS = [
  { id: 'popular', title: 'Популярные' },
  { id: 'votes', title: 'По голосам за озвучку' },
  { id: 'title', title: 'По названию' },
  { id: 'date', title: 'Сначала новые (по дате принятия)' },
];

export function LibraryScreen() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [debounced, setDebounced] = useState(q);
  const [sheet, setSheet] = useState(false);
  const category = params.get('category') ?? undefined;
  const audio = params.get('audio') ?? undefined;
  const favorites = params.get('favorites') ?? undefined;
  const sort = params.get('sort') ?? 'popular';
  const { listen, sheet: soonSheet } = useListen();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (debounced.length >= 2) track('search', { len: debounced.length });
  }, [debounced]);

  const catalog = useCatalog({ q: debounced || undefined, category, audio, favorites, sort });
  const cats = useCategories();
  const set = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const items = catalog.data?.items ?? [];
  const constitution = items.find((d) => d.id === CONSTITUTION_ID);
  const rest = items.filter((d) => d.id !== CONSTITUTION_ID);
  const filtersOn = (audio ? 1 : 0) + (favorites ? 1 : 0) + (sort !== 'popular' ? 1 : 0);

  return (
    <Screen>
      <TopBar title="Библиотека" right={<button className={`icon-btn ${filtersOn ? 'on' : ''}`} aria-label="Фильтры и сортировка" onClick={() => setSheet(true)}><Icon name="filter" /></button>} />
      <label className="search">
        <Icon name="search" size={20} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или номер: «ТК», «152-ФЗ», «трудовой»" aria-label="Поиск по каталогу" enterKeyHint="search" />
        {q ? <button className="icon-btn" aria-label="Очистить" onClick={() => setQ('')}><Icon name="close" size={18} /></button> : null}
      </label>
      <div className="chips" style={{ marginTop: 12 }}>
        <button className={`chip ${!category ? 'active' : ''}`} onClick={() => set('category')}>Все</button>
        {CATEGORIES.map((c) => {
          const n = cats.data?.find((x) => x.id === c.id)?.count;
          return <button key={c.id} className={`chip ${category === c.id ? 'active' : ''}`} onClick={() => set('category', c.id)}>{c.title}{n != null ? ` · ${n}` : ''}</button>;
        })}
      </div>

      {catalog.isError ? <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} /> : catalog.isLoading ? <div style={{ marginTop: 16 }}><Skeleton h={96} n={4} /></div> : (
        <>
          <p className="hint" style={{ margin: '12px 0' }}>
            {items.length} {plural(items.length, 'документ', 'документа', 'документов')}
            {filtersOn ? ' · фильтры включены' : ''} · каталог беты — не полный массив законодательства РФ
          </p>
          {constitution ? (
            <div style={{ marginBottom: 12 }}>
              <div className="row" style={{ marginBottom: 6 }}><span className="badge audio"><Icon name="sparkle" size={13} /> Единственная аудиокнига бета-версии</span></div>
              <DocCard doc={constitution} onListen={() => listen(constitution)} />
            </div>
          ) : null}
          {rest.length ? <div className="stack">{rest.map((d) => <DocCard key={d.id} doc={d} onListen={() => listen(d)} />)}</div> : !constitution ? (
            <Empty icon="search" title="Ничего не найдено" action={<button className="btn" onClick={() => { setQ(''); setParams(new URLSearchParams(), { replace: true }); }}>Сбросить поиск и фильтры</button>}>
              Попробуйте другое название или номер документа.
            </Empty>
          ) : null}
        </>
      )}

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Фильтры и сортировка">
        <p className="hint" style={{ margin: '4px 0 6px' }}>Аудио</p>
        {[{ v: undefined, t: 'Все документы' }, { v: 'available', t: 'Доступно аудио' }, { v: 'in_production', t: 'Озвучка в разработке' }].map((o) => (
          <button key={o.t} className={`option-row ${audio === o.v ? 'on' : ''}`} onClick={() => set('audio', o.v)}>{o.t}{audio === o.v ? <Icon name="check" /> : null}</button>
        ))}
        <p className="hint" style={{ margin: '14px 0 6px' }}>Показать</p>
        <button className={`option-row ${favorites ? 'on' : ''}`} onClick={() => set('favorites', favorites ? undefined : '1')}>Только избранное{favorites ? <Icon name="check" /> : null}</button>
        <p className="hint" style={{ margin: '14px 0 6px' }}>Сортировка</p>
        {SORTS.map((s) => (
          <button key={s.id} className={`option-row ${sort === s.id ? 'on' : ''}`} onClick={() => set('sort', s.id === 'popular' ? undefined : s.id)}>{s.title}{sort === s.id ? <Icon name="check" /> : null}</button>
        ))}
        <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => setSheet(false)}>Готово</button>
      </Sheet>
      {soonSheet}
    </Screen>
  );
}
