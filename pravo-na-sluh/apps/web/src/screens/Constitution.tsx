// Аудиокнига Конституции: продолжение прослушивания, содержание (разделы → главы → статьи, раскрываются
// на месте с отступом), поиск по разделам, главам и тексту статей, сведения о редакции внизу страницы.
// Нажатие на статью открывает её страницу и сразу включает звук.

import type { ArticleSearchHitDto, ConstitutionTocDto, TocArticleDto, TocChapterDto } from '@pravo/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { ErrorState, Progress, Skeleton, Spinner, TopBar } from '../components/ui.tsx';
import { get } from '../lib/api.ts';
import { artNumber, dateRu, duration, norm, plural } from '../lib/format.ts';
import { useToc } from '../lib/hooks.ts';
import { pushRecent } from '../lib/storage.ts';
import { openExternal } from '../lib/telegram.ts';
import { articleIsCurrent, usePlayer } from '../player/PlayerProvider.tsx';

interface Section {
  key: string;
  title: string;
  /** Название раздела (есть только у второго). */
  name: string | null;
  chapters: TocChapterDto[];
  final: boolean;
}

/** «Статьи 1–16», «Статьи 65–79¹», «Пункты 1–9». */
export function rangeLabel(arts: TocArticleDto[], final = false): string {
  const nums = arts.map((a) => a.number).filter((n): n is string => !!n);
  if (!nums.length) return '';
  const word = final ? (nums.length === 1 ? 'Пункт' : 'Пункты') : nums.length === 1 ? 'Статья' : 'Статьи';
  return nums.length === 1 ? `${word} ${artNumber(nums[0])}` : `${word} ${artNumber(nums[0])}–${artNumber(nums[nums.length - 1])}`;
}

function buildSections(t: ConstitutionTocDto): Section[] {
  const out: Section[] = [];
  for (const c of t.chapters) {
    if (c.key === 'preamble') continue;
    let s = out.find((x) => x.title === c.sectionTitle);
    if (!s) {
      s = { key: `section-${out.length + 1}`, title: c.sectionTitle, name: c.key === 'final' ? c.title : null, chapters: [], final: c.key === 'final' };
      out.push(s);
    }
    s.chapters.push(c);
  }
  return out;
}

/** Открыть статью и сразу включить её звук (если она уже звучит — просто продолжить). */
function useOpenArticle() {
  const nav = useNavigate();
  const player = usePlayer();
  return (key: string) => {
    const inPlaylist = player.playlist?.tracks.some((t) => t.key === key);
    if (articleIsCurrent(player, key)) {
      if (player.status !== 'playing' && player.status !== 'loading') player.toggle();
    } else if (inPlaylist && player.status !== 'unavailable') {
      player.playKey(key);
    }
    nav(`/constitution/${key}`);
  };
}

export function ConstitutionScreen() {
  const toc = useToc();
  const player = usePlayer();
  const nav = useNavigate();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  useEffect(() => pushRecent('constitution-rf'), []);

  const sections = useMemo(() => (toc.data ? buildSections(toc.data) : []), [toc.data]);
  const currentChapter = player.track?.chapterKey;
  useEffect(() => {
    if (!currentChapter) return;
    const s = sections.find((x) => x.chapters.some((c) => c.key === currentChapter));
    if (s) setOpen((o) => new Set(o).add(s.key).add(currentChapter));
  }, [currentChapter, sections]);

  useEffect(() => {
    if (!scrollTo) return;
    document.getElementById(`toc-${scrollTo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollTo(null);
  }, [scrollTo]);

  const totals = useMemo(() => {
    const arts = toc.data?.chapters.flatMap((c) => c.articles) ?? [];
    return { total: arts.length, done: arts.filter((a) => a.completed).length };
  }, [toc.data]);

  if (toc.isLoading) return <Screen><TopBar title="Конституция РФ" back /><Skeleton h={170} /><div style={{ height: 12 }} /><Skeleton h={56} n={6} /></Screen>;
  if (toc.isError || !toc.data) return <Screen><TopBar title="Конституция РФ" back /><ErrorState error={toc.error} onRetry={() => toc.refetch()} /></Screen>;
  const t = toc.data;
  const v = t.edition.verification;
  const playing = player.status === 'playing' || player.status === 'loading';
  const preamble = t.chapters.find((c) => c.key === 'preamble');

  const toggle = (key: string) => setOpen((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const reveal = (keys: string[]) => {
    setOpen((s) => { const n = new Set(s); keys.forEach((k) => n.add(k)); return n; });
    setSearching(false);
    setQuery('');
    setScrollTo(keys[keys.length - 1]);
  };
  const closeSearch = () => { setSearching(false); setQuery(''); };

  return (
    <Screen>
      <TopBar title="Конституция РФ" back />
      <section className="hero card">
        <div className="eyebrow">Аудиокнига · бета</div>
        <h2>{t.title}</h2>
        <p>{t.adoption}</p>
        <div style={{ margin: '14px 0 6px' }}><Progress value={(totals.done / Math.max(1, totals.total)) * 100} /></div>
        <p className="small" style={{ fontSize: 12 }}>
          Прослушано {totals.done} из {totals.total} · {player.playlist?.totalDurationMs ? `всего ${duration(player.playlist.totalDurationMs)}` : 'аудио загружается'}
        </p>
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn on-hero grow" disabled={player.status === 'unavailable'} onClick={() => { if (player.track) player.toggle(); else player.playKey('intro'); }}>
            <Icon name={playing ? 'pause' : 'play'} fill size={18} /> {playing ? 'Пауза' : player.track ? `Продолжить: ${player.track.title}` : 'Слушать с начала'}
          </button>
          {player.track ? <button className="btn" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }} onClick={() => nav('/player')} aria-label="Открыть плеер"><Icon name="headphones" /></button> : null}
        </div>
      </section>

      <div className="toc-head">
        {searching ? (
          <div className="search toc-search">
            <Icon name="search" size={18} />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
              placeholder="Поиск" aria-label="Поиск по Конституции" enterKeyHint="search" />
            <button className="icon-btn" aria-label="Закрыть поиск" onClick={closeSearch}><Icon name="close" size={18} /></button>
          </div>
        ) : (
          <>
            <button className="search-round" aria-label="Поиск по Конституции" onClick={() => setSearching(true)}><Icon name="search" size={20} /></button>
            <h2>Содержание</h2>
          </>
        )}
      </div>

      {searching && query.trim() ? (
        <SearchResults toc={t} sections={sections} query={query} onReveal={reveal} />
      ) : (
        <div className="toc">
          {preamble ? <PreambleRow c={preamble} /> : null}
          {sections.map((s) => (
            <SectionNode key={s.key} s={s} open={open} toggle={toggle} />
          ))}
        </div>
      )}

      <div className="source-box" style={{ marginTop: 24 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Icon name="shield" size={18} />
          <div className="grow">
            <b>{t.edition.label}</b>
            <div>Текст получен из ИПС «Законодательство России» (pravo.gov.ru) {dateRu(t.edition.retrievedAt)}{v ? `; сверен с kremlin.ru: ${v.matched} из ${v.total} фрагментов совпали дословно, расхождения — только пунктуация и служебные метки сайта` : ''}.</div>
            <div style={{ marginTop: 4 }}>Аудиоверсия не является официальным опубликованием.</div>
            <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => openExternal(t.edition.sourceUrl)}><Icon name="external" size={16} /> Официальный текст</button>
          </div>
        </div>
      </div>
    </Screen>
  );
}

function Chevron({ open }: { open: boolean }) {
  return <Icon name="right" size={18} className={`chev ${open ? 'open' : ''}`} />;
}

function PreambleRow({ c }: { c: TocChapterDto }) {
  const openArticle = useOpenArticle();
  const player = usePlayer();
  const a = c.articles[0];
  if (!a) return null;
  const isCurrent = articleIsCurrent(player, a.key);
  return (
    <button id="toc-preamble" className={`toc-row lvl-0 ${isCurrent ? 'current' : ''}`} onClick={() => openArticle(a.key)}>
      <span className="num">§</span>
      <span className="grow">
        <span className="ttl">Преамбула</span>
        <span className="meta">{a.completed ? 'Прослушана' : a.listenedPct ? `Прослушано ${a.listenedPct}%` : a.firstLine}</span>
      </span>
      <Icon name={isCurrent && player.status === 'playing' ? 'pause' : 'play'} fill size={14} className="toc-play" />
    </button>
  );
}

function SectionNode({ s, open, toggle }: { s: Section; open: Set<string>; toggle: (key: string) => void }) {
  const arts = s.chapters.flatMap((c) => c.articles);
  const done = arts.filter((a) => a.completed).length;
  const isOpen = open.has(s.key);
  const chapters = s.chapters.length;
  return (
    <div className={`toc-node ${isOpen ? 'open' : ''}`}>
      <button id={`toc-${s.key}`} className="toc-row lvl-0" onClick={() => toggle(s.key)} aria-expanded={isOpen}>
        <span className="num">{s.final ? 'II' : 'I'}</span>
        <span className="grow">
          <span className="eyebrow-s">{s.title}</span>
          <span className="ttl">{s.name ?? rangeLabel(arts)}</span>
          <span className="meta">{s.name ? `${rangeLabel(arts, true)} · ` : `${chapters} ${plural(chapters, 'глава', 'главы', 'глав')} · `}прослушано {done} из {arts.length}</span>
        </span>
        <Chevron open={isOpen} />
      </button>
      {isOpen ? (
        <div className="toc-children">
          {s.final
            ? s.chapters[0].articles.map((a) => <ArticleRow key={a.key} a={a} />)
            : s.chapters.map((c) => <ChapterNode key={c.key} c={c} open={open.has(c.key)} toggle={() => toggle(c.key)} />)}
        </div>
      ) : null}
    </div>
  );
}

function ChapterNode({ c, open, toggle }: { c: TocChapterDto; open: boolean; toggle: () => void }) {
  const done = c.articles.filter((a) => a.completed).length;
  return (
    <div className={`toc-node ${open ? 'open' : ''}`}>
      <button id={`toc-${c.key}`} className="toc-row lvl-1" onClick={toggle} aria-expanded={open}>
        <span className="num small">{c.number}</span>
        <span className="grow">
          <span className="eyebrow-s">Глава {c.number} · {rangeLabel(c.articles)}</span>
          <span className="ttl">{c.title}</span>
          <span className="meta">прослушано {done} из {c.articles.length}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open ? <div className="toc-children">{c.articles.map((a) => <ArticleRow key={a.key} a={a} />)}</div> : null}
    </div>
  );
}

function ArticleRow({ a }: { a: TocArticleDto }) {
  const openArticle = useOpenArticle();
  const player = usePlayer();
  const isCurrent = articleIsCurrent(player, a.key);
  const state = a.completed ? 'done' : isCurrent ? 'now' : a.listenedPct > 0 ? 'part' : '';
  return (
    <button className={`art-row toc-art ${isCurrent ? 'current' : ''}`} onClick={() => openArticle(a.key)} aria-label={`${a.title}: открыть и слушать`}>
      <span className={`state ${state}`}>
        {a.completed ? <Icon name="check" size={14} /> : isCurrent ? <Icon name={player.status === 'playing' ? 'pause' : 'play'} fill size={11} /> : <Icon name="play" fill size={10} />}
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="t" style={{ display: 'block' }}>{a.title}{a.status === 'excluded' ? <span className="hint"> · исключена</span> : null}{a.favorite ? <span style={{ color: 'var(--accent)' }}> ★</span> : null}</span>
        <span className="f">{a.firstLine}</span>
      </span>
      <span className="hint" style={{ fontSize: 11, minWidth: 30, textAlign: 'right' }}>{a.completed ? '' : a.listenedPct ? `${a.listenedPct}%` : ''}</span>
    </button>
  );
}

// ── Поиск: номер статьи («80», «ст. 67.1», «пункт 3»), глава («глава 3»), раздел, названия и текст статей.

const sectionNumber = (w: string) => (/^(2|ii|втор)/.test(w) ? 2 : /^(1|i|перв)/.test(w) ? 1 : 0);

function SearchResults({ toc, sections, query, onReveal }: { toc: ConstitutionTocDto; sections: Section[]; query: string; onReveal: (keys: string[]) => void }) {
  const openArticle = useOpenArticle();
  const q = norm(query);
  const [debounced, setDebounced] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(timer.current);
  }, [q]);
  const text = useQuery({
    queryKey: ['constitution-search', debounced],
    queryFn: () => get<{ items: ArticleSearchHitDto[] }>(`/api/constitution/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 3 && !/^\d/.test(debounced),
    staleTime: 60_000,
  });

  const all = toc.chapters.flatMap((c) => c.articles.map((a) => ({ a, c })));
  const sectionOf = (c: TocChapterDto) => sections.find((s) => s.chapters.includes(c));

  // Точные совпадения по номеру
  const numArt = q.match(/^(?:ст(?:атья|\.)?\s*)?(\d+)(?:[.,](\d+))?$/);
  const numItem = q.match(/^(?:п(?:ункт|\.)?\s*)(\d+)$/);
  const numChapter = q.match(/^(?:гл(?:ава|\.)?\s*(\d+)|(\d+)\s*глава)$/);
  const numSection = q.match(/^(?:раздел\s*(\S*)|(\S+)\s*раздел)$/);

  const sectionHits = sections.filter((s) => {
    if (numSection) {
      const w = (numSection[1] ?? numSection[2] ?? '').replace(/[^a-zа-я0-9]/g, '');
      return w === '' || sectionNumber(w) === (s.final ? 2 : 1);
    }
    return q.length >= 3 && norm(`${s.title} ${s.name ?? ''}`).includes(q);
  });
  const chapterHits = toc.chapters.filter((c) => c.number && (numChapter ? Number(numChapter[1] ?? numChapter[2]) === c.number : q.length >= 3 && norm(`глава ${c.number} ${c.title}`).includes(q)));
  const articleHits = all.filter(({ a, c }) => {
    if (numArt) return c.key !== 'final' && a.number === (numArt[2] ? `${numArt[1]}.${numArt[2]}` : numArt[1]);
    if (numItem) return c.key === 'final' && a.number === numItem[1];
    return q.length >= 3 && norm(`${a.title} ${a.firstLine}`).includes(q);
  });
  const seen = new Set(articleHits.map((h) => h.a.key));
  const textHits = debounced === q && text.isSuccess ? text.data.items.filter((h) => !seen.has(h.key)) : [];
  const pending = q.length >= 3 && !/^\d/.test(q) && (debounced !== q || text.isFetching);
  const empty = !sectionHits.length && !chapterHits.length && !articleHits.length && !textHits.length;
  if (q.length < 3 && !numArt && !numItem && !numChapter && !numSection) return null;

  return (
    <div className="list toc-results">
      {sectionHits.map((s) => (
        <button key={s.key} className="art-row" onClick={() => onReveal([s.key])}>
          <span className="num-s">{s.final ? 'II' : 'I'}</span>
          <span className="grow"><span className="t" style={{ display: 'block' }}>{s.title}{s.name ? `. ${s.name}` : ''}</span><span className="f">{rangeLabel(s.chapters.flatMap((c) => c.articles), s.final)}</span></span>
        </button>
      ))}
      {chapterHits.map((c) => (
        <button key={c.key} className="art-row" onClick={() => onReveal([sectionOf(c)?.key ?? '', c.key].filter(Boolean))}>
          <span className="num-s">{c.number}</span>
          <span className="grow"><span className="t" style={{ display: 'block' }}>Глава {c.number}. {c.title}</span><span className="f">{rangeLabel(c.articles)}</span></span>
        </button>
      ))}
      {articleHits.map(({ a, c }) => (
        <button key={a.key} className="art-row" onClick={() => openArticle(a.key)}>
          <span className="num-s"><Icon name="play" fill size={10} /></span>
          <span className="grow" style={{ minWidth: 0 }}><span className="t" style={{ display: 'block' }}>{a.title}</span><span className="f">{c.number ? `Глава ${c.number} · ` : ''}{a.firstLine}</span></span>
        </button>
      ))}
      {textHits.map((h) => (
        <button key={h.key} className="art-row" onClick={() => openArticle(h.key)}>
          <span className="num-s"><Icon name="play" fill size={10} /></span>
          <span className="grow" style={{ minWidth: 0 }}><span className="t" style={{ display: 'block' }}>{h.title}</span><span className="f">{h.before}<mark>{h.match}</mark>{h.after}</span></span>
        </button>
      ))}
      {pending && empty ? <div className="center" style={{ padding: 20 }}><Spinner /></div> : null}
      {!pending && empty ? <div className="hint" style={{ padding: 16 }}>Ничего не найдено</div> : null}
    </div>
  );
}
