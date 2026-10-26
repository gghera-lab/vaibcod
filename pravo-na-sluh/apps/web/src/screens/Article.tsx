// Страница статьи: плеер вверху (закреплён, пока читается текст), текст с подсветкой читаемого
// фрагмента; проверка себя, переход к соседним статьям и сведения о редакции — ниже первого экрана.
// Пока статья звучит, страница следует за плеером: при переходе к следующей статье открывается её текст.

import type { ArticleDto, TextUnit } from '@pravo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { ErrorState, Skeleton, Spinner, TopBar, useToast } from '../components/ui.tsx';
import { track } from '../lib/analytics.ts';
import { put } from '../lib/api.ts';
import { clock } from '../lib/format.ts';
import { useArticle } from '../lib/hooks.ts';
import { haptic } from '../lib/telegram.ts';
import { articleIsCurrent, usePlayer } from '../player/PlayerProvider.tsx';

const RATES = [0.75, 0.9, 1, 1.15, 1.25, 1.5, 1.75, 2];

export function unitLabel(u: TextUnit): string | null {
  if (!u.label) return null;
  const sup = (s: string) => s.replace(/\.(\d+)$/, (_, d: string) => d.split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]).join(''));
  if (u.type === 'item') return `${sup(u.label)})`;
  return `${sup(u.label)}.`;
}

export function LawText({ units, activeUnit }: { units: TextUnit[]; activeUnit: string | null }) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const userScrollAt = useRef(0);
  useEffect(() => {
    const mark = () => { userScrollAt.current = Date.now(); };
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('wheel', mark, { passive: true });
    return () => { window.removeEventListener('touchmove', mark); window.removeEventListener('wheel', mark); };
  }, []);
  // Читаемый фрагмент подтягивается в центр экрана, только если он не виден и человек сейчас не листает сам.
  useEffect(() => {
    const el = activeUnit ? refs.current[activeUnit] : null;
    if (!el || Date.now() - userScrollAt.current < 4000) return;
    const r = el.getBoundingClientRect();
    if (r.top < 190 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeUnit]);
  return (
    <div className="law-text">
      {units.map((u) => (
        <div key={u.id} ref={(el) => { refs.current[u.id] = el; }} className={`law-unit ${u.type === 'item' ? 'item' : ''} ${activeUnit === u.id ? 'active' : ''}`}>
          {unitLabel(u) ? <span className="label">{unitLabel(u)}</span> : null}
          {u.text}
          {u.notes.map((n, i) => <div key={i} className="law-note">({n})</div>)}
        </div>
      ))}
    </div>
  );
}

/** Плеер статьи: если звучит другая статья — кнопка запускает эту. */
function ArticlePlayer({ a }: { a: ArticleDto }) {
  const p = usePlayer();
  const nav = useNavigate();
  const [scrub, setScrub] = useState<number | null>(null);
  const own = p.playlist?.tracks.find((t) => t.key === a.key) ?? null;
  const current = articleIsCurrent(p, a.key);
  const leadIn = current && p.track?.key !== a.key && p.track?.articleKey !== a.key; // звучит заставка главы перед статьёй
  const live = current && !leadIn;
  const playing = current && (p.status === 'playing' || p.status === 'loading');
  const dur = live ? p.duration : own?.durationMs ?? 0;
  const pos = scrub ?? (live ? p.position : 0);

  if (!p.ready) return <div className="card art-player center" style={{ minHeight: 120 }}><Spinner /></div>;
  if (!own || !p.playlist || p.playlist.status === 'unavailable') {
    return <div className="state-box warn" style={{ margin: '10px 0 16px' }}><Icon name="alert" size={18} /><span>{p.playlistError ?? 'Аудио этой статьи пока недоступно. Текст — ниже.'}</span></div>;
  }

  const seekTo = (ms: number) => (live ? p.seek(ms) : p.playKey(a.key, { positionMs: ms }));
  const endScrub = () => { if (scrub != null) { seekTo(scrub); setScrub(null); } };
  const go = (key: string | null) => { if (!key) return; p.playKey(key); nav(`/constitution/${key}`, { replace: true }); };
  const nextRate = RATES[(RATES.indexOf(p.rate) + 1) % RATES.length] ?? 1;

  return (
    <div className="card art-player sticky-player">
      <div className="ap-top">
        <span className={`dotlive ${playing ? 'on' : ''}`} />
        <span className="grow ellipsis">{leadIn ? 'Звучит название главы' : playing ? 'Сейчас звучит' : current ? 'На паузе' : 'Слушать статью'} · {clock(own.durationMs)}</span>
        <button className={`btn small ${p.rate !== 1 ? 'primary' : ''}`} aria-label={`Скорость ${p.rate}×, нажмите для ${nextRate}×`} onClick={() => p.setRate(nextRate)}>{p.rate}×</button>
        <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label="Открыть плеер полностью" onClick={() => { if (!current) p.playKey(a.key, { autoplay: false }); nav('/player'); }}><Icon name="headphones" size={20} /></button>
      </div>
      {p.status === 'error' && current ? (
        <div className="state-box error small"><Icon name="alert" size={16} /><span className="grow">{p.error ?? 'Ошибка загрузки аудио'}</span><button className="btn small danger" onClick={() => p.retry()}>Повторить</button></div>
      ) : null}
      <input className="seek" type="range" min={0} max={Math.max(1, dur)} step={500} value={Math.min(pos, dur)} aria-label="Позиция в статье"
        onChange={(e) => setScrub(Number(e.target.value))} onPointerUp={endScrub} onKeyUp={endScrub} onTouchEnd={endScrub} />
      <div className="times"><span>{clock(pos)}</span><span>−{clock(Math.max(0, dur - pos))}</span></div>
      <div className="controls">
        <button className="ctrl" aria-label="Предыдущая статья" disabled={!a.prevKey} onClick={() => go(a.prevKey)}><Icon name="prev" size={22} /></button>
        <button className="ctrl" aria-label="Назад на 15 секунд" disabled={!live} onClick={() => p.skip(-15000)}><Icon name="back15" size={22} />15</button>
        <button className="ctrl big" aria-label={playing ? 'Пауза' : 'Слушать'} onClick={() => (current ? p.toggle() : p.playKey(a.key))}>
          {playing && p.status === 'loading' ? <Spinner /> : <Icon name={playing ? 'pause' : 'play'} fill size={26} />}
        </button>
        <button className="ctrl" aria-label="Вперёд на 15 секунд" disabled={!live} onClick={() => p.skip(15000)}><Icon name="fwd15" size={22} />15</button>
        <button className="ctrl" aria-label="Следующая статья" disabled={!a.nextKey} onClick={() => go(a.nextKey)}><Icon name="next" size={22} /></button>
      </div>
    </div>
  );
}

export function ArticleScreen() {
  const { key = '' } = useParams();
  const q = useArticle(key);
  const player = usePlayer();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  // Страница следует за звуком: если эта статья звучала и плеер сам перешёл к следующей — открываем её.
  const current = articleIsCurrent(player, key);
  const followKey = useRef<string | null>(null);
  useEffect(() => {
    if (current) { followKey.current = key; return; }
    if (followKey.current !== key) return;
    followKey.current = null;
    const t = player.track;
    if (!t || (player.status !== 'playing' && player.status !== 'loading')) return;
    const target = t.articleKey ?? (t.kind === 'chapter_intro' ? player.playlist?.tracks[player.index + 1]?.articleKey : null);
    if (target && target !== key) nav(`/constitution/${target}`, { replace: true });
  }, [current, key, player.track, player.status, player.playlist, player.index, nav]);

  if (q.isLoading) return <Screen><TopBar title="Статья" back /><Skeleton h={40} /><div style={{ height: 12 }} /><Skeleton h={120} n={3} /></Screen>;
  if (q.isError || !q.data) return <Screen><TopBar title="Статья" back /><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const a = q.data;
  const reading = player.track?.key === a.key || player.track?.articleKey === a.key;
  const playing = current && (player.status === 'playing' || player.status === 'loading');

  const toggleFav = async () => {
    try {
      await put(`/api/constitution/articles/${a.key}/favorite`, { on: !a.favorite });
      haptic.success();
      track(a.favorite ? 'favorite_remove' : 'favorite_add', { article: a.key });
      qc.setQueryData(['article', a.key], { ...a, favorite: !a.favorite });
      void qc.invalidateQueries({ queryKey: ['favorites'] });
      void qc.invalidateQueries({ queryKey: ['toc'] });
      toast(a.favorite ? 'Статья удалена из избранного' : 'Статья добавлена в избранное');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'error');
    }
  };
  // Соседняя статья: если звук идёт — продолжаем слушать уже её.
  const open = (k: string | null) => { if (!k) return; if (playing) player.playKey(k); nav(`/constitution/${k}`, { replace: true }); };

  return (
    <Screen>
      <div className="article-first">
        <TopBar title={a.title} back right={
          <button className={`icon-btn ${a.favorite ? 'on' : ''}`} aria-label={a.favorite ? 'Убрать статью из избранного' : 'Статью в избранное'} onClick={toggleFav}>
            <Icon name="star" fill={a.favorite} />
          </button>
        } />
        <p className="hint" style={{ marginTop: -8 }}>{a.kind === 'preamble' ? 'Конституция Российской Федерации' : a.chapterTitle}</p>

        <ArticlePlayer a={a} />

        {a.status === 'excluded' ? <div className="state-box info" style={{ marginBottom: 12 }}><Icon name="info" size={18} /> Статья исключена из текста Конституции.</div> : null}
        <LawText units={a.units} activeUnit={reading ? player.currentUnitId : null} />
        {a.notes.length ? <div className="source-box" style={{ marginTop: 12 }}>{a.notes.map((n, i) => <div key={i}>{n}</div>)}</div> : null}
      </div>

      <div className="article-more">
        {a.cardsCount > 0 ? (
          <button className="card tap" onClick={() => nav(`/memory/review?mode=article&key=${a.key}`)}>
            <div className="row">
              <Icon name="brain" />
              <div className="grow"><div className="doc-title">Проверить, что запомнил</div><div className="doc-meta">{a.cardsCount} {a.cardsCount === 1 ? 'вопрос' : a.cardsCount < 5 ? 'вопроса' : 'вопросов'} по этой статье</div></div>
              <Icon name="right" />
            </div>
          </button>
        ) : null}

        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          <button className="btn grow" disabled={!a.prevKey} onClick={() => open(a.prevKey)}><Icon name="left" size={18} /> Предыдущая</button>
          <button className="btn grow" disabled={!a.nextKey} onClick={() => open(a.nextKey)}>Следующая <Icon name="right" size={18} /></button>
        </div>
        <p className="hint" style={{ marginTop: 16 }}>{a.editionLabel}. Источник: ИПС «Законодательство России» (pravo.gov.ru). Аудио и текст в приложении не являются официальным опубликованием.</p>
      </div>
    </Screen>
  );
}
