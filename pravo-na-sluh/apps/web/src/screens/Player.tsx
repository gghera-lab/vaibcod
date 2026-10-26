// Полноэкранный плеер аудиокниги Конституции РФ.

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { Sheet, Spinner, TopBar, useToast } from '../components/ui.tsx';
import { track } from '../lib/analytics.ts';
import { post, put } from '../lib/api.ts';
import { clock } from '../lib/format.ts';
import { useArticle, useToc } from '../lib/hooks.ts';
import { haptic } from '../lib/telegram.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { Reader, type ReaderLine } from '../components/Reader.tsx';

const RATES = [0.75, 0.9, 1, 1.15, 1.25, 1.5, 1.75, 2];
const SLEEP = [5, 15, 30, 45, 60];

export function PlayerScreen() {
  const p = usePlayer();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const toc = useToc();
  const [view, setView] = useState<'text' | 'compact'>('text');
  const [sheet, setSheet] = useState<null | 'speed' | 'sleep' | 'voice' | 'chapters' | 'bookmark'>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [, tick] = useState(0);
  const articleKey = p.track?.articleKey ?? null;
  const article = useArticle(articleKey ?? '');
  const chapter = toc.data?.chapters.find((c) => c.key === p.track?.chapterKey);
  const favorite = article.data?.favorite ?? false;

  // Обновление обратного отсчёта таймера сна
  useEffect(() => {
    if (p.sleep.kind !== 'time') return;
    const iv = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, [p.sleep.kind]);

  const playing = p.status === 'playing' || p.status === 'loading';
  const pos = scrub ?? p.position;
  const sleepLeft = p.sleep.kind === 'time' ? Math.max(0, p.sleep.endsAt - Date.now()) : 0;

  const addBookmark = async () => {
    if (!p.track) return;
    try {
      await post('/api/bookmarks', { trackKey: p.track.key, positionMs: Math.round(p.position), note: note.trim() || undefined });
      haptic.success();
      track('bookmark_add', { track: p.track.key });
      void qc.invalidateQueries({ queryKey: ['favorites'] });
      toast(`Закладка: ${p.track.title}, ${clock(p.position)}`);
      setNote('');
      setSheet(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сохранить закладку', 'error');
    }
  };
  const toggleFavorite = async () => {
    if (!articleKey || !article.data) return;
    try {
      await put(`/api/constitution/articles/${articleKey}/favorite`, { on: !favorite });
      haptic.success();
      qc.setQueryData(['article', articleKey], { ...article.data, favorite: !favorite });
      void qc.invalidateQueries({ queryKey: ['favorites'] });
      void qc.invalidateQueries({ queryKey: ['toc'] });
      toast(favorite ? 'Статья удалена из избранного' : 'Статья в избранном');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'error');
    }
  };

  if (!p.ready) return <Screen><TopBar title="Плеер" back /><div className="center" style={{ padding: 40 }}><Spinner /></div></Screen>;

  if (!p.playlist || p.playlist.status === 'unavailable') {
    return (
      <Screen>
        <TopBar title="Плеер" back />
        <div className="state-box warn"><Icon name="alert" size={18} /><span>{p.playlistError ?? 'Аудио временно недоступно: файлы аудиокниги не загружены на сервер. Текст Конституции можно читать.'}</span></div>
        <div className="stack-s" style={{ marginTop: 12 }}>
          <button className="btn primary block" onClick={() => p.reloadPlaylist()}>Повторить загрузку</button>
          <button className="btn block" onClick={() => nav('/constitution')}>Открыть текст Конституции</button>
        </div>
      </Screen>
    );
  }

  if (!p.track) {
    return (
      <Screen>
        <TopBar title="Плеер" back />
        <div className="player-art"><div className="chap">Конституция РФ</div><div className="ttl">Начните с вступления</div></div>
        <button className="btn primary block" style={{ marginTop: 16 }} onClick={() => p.playKey('intro')}><Icon name="play" fill size={18} /> Слушать с начала</button>
        <button className="btn block" style={{ marginTop: 8 }} onClick={() => setSheet('chapters')}><Icon name="list" size={18} /> Выбрать главу и статью</button>
        <ChaptersSheet open={sheet === 'chapters'} onClose={() => setSheet(null)} />
      </Screen>
    );
  }

  const voiceBeta = p.playlist.voice?.quality === 'beta';
  const cur = p.track;
  const segIndex = cur.segments.findIndex((sg) => pos >= sg.startMs - 150 && pos < sg.endMs + 400);
  const chapterLabel = cur.kind === 'intro' ? 'Конституция РФ' : chapter ? (chapter.number ? `Глава ${chapter.number}` : chapter.title) : 'Конституция РФ';

  // Строки вступления и названий глав (у них нет частей статьи) — в том же порядке, что и в сценарии озвучки.
  const headingLines = (): ReaderLine[] => {
    if (cur.kind === 'intro' && toc.data) {
      return [
        { text: 'Конституция Российской Федерации', kind: 'title' },
        { text: toc.data.adoption, kind: 'note' },
        { text: `Текст по Официальному интернет-порталу правовой информации, ${toc.data.edition.label.toLowerCase()}. Аудиоверсия не является официальным опубликованием.`, kind: 'note' },
      ];
    }
    if (cur.kind === 'chapter_intro' && chapter) {
      const lines: ReaderLine[] = [];
      const withSection = cur.segments.length > (chapter.number ? 2 : 1);
      if (withSection) lines.push({ text: chapter.key === 'final' ? 'Раздел второй' : chapter.sectionTitle, kind: 'heading' });
      if (chapter.number) lines.push({ text: `Глава ${chapter.number}`, kind: 'heading' });
      lines.push({ text: chapter.title, kind: 'title' });
      return lines;
    }
    return [];
  };

  return (
    <Screen className="player-screen">
      <TopBar title="Сейчас звучит" back right={
        <div className="segmented" style={{ width: 150 }}>
          <button className={view === 'text' ? 'on' : ''} onClick={() => setView('text')}>Текст</button>
          <button className={view === 'compact' ? 'on' : ''} onClick={() => setView('compact')}>Кратко</button>
        </div>
      } />
      <div className="player">
        {view === 'text' ? (
          <>
            <div className="now-line">
              <span className={`dotlive ${playing ? 'on' : ''}`} />
              <span className="grow ellipsis">{chapterLabel}{chapter?.number && cur.kind !== 'intro' ? ` · ${chapter.title}` : ''}</span>
              <span>{p.index + 1} / {p.playlist.tracks.length}</span>
            </div>
            {articleKey ? (
              article.data ? (
                <Reader
                  title={article.data.title}
                  subtitle={article.data.kind === 'preamble' ? 'Конституция Российской Федерации' : article.data.chapterTitle}
                  notes={article.data.notes}
                  units={article.data.units}
                  activeUnit={p.currentUnitId}
                  onOpen={() => nav(`/constitution/${articleKey}`)}
                />
              ) : <div className="skeleton" style={{ height: 'clamp(220px, 40vh, 440px)' }} />
            ) : (
              <Reader title={cur.title} subtitle={cur.kind === 'intro' ? 'Вступление к аудиокниге' : 'Заголовок раздела и главы'}
                lines={headingLines()} activeUnit={null} activeLine={segIndex} />
            )}
          </>
        ) : (
          <div className="player-art">
            <div className={`wave ${playing ? '' : 'paused'}`} aria-hidden>{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</div>
            <div className="chap">{chapterLabel}</div>
            <div className="ttl">{cur.title}</div>
            {chapter?.number && cur.kind !== 'intro' ? <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>{chapter.title}</div> : null}
          </div>
        )}

        {p.status === 'error' ? (
          <div className="state-box error"><Icon name="alert" size={18} /><span className="grow">{p.error ?? 'Ошибка загрузки аудио'}</span><button className="btn small danger" onClick={() => p.retry()}>Повторить</button></div>
        ) : p.status === 'offline' ? (
          <div className="state-box warn"><Icon name="offline" size={18} /><span className="grow">Нет подключения. Воспроизведение продолжится, когда сеть появится.</span><button className="btn small" onClick={() => p.retry()}>Повторить</button></div>
        ) : p.status === 'unavailable' ? (
          <div className="state-box warn"><Icon name="alert" size={18} /><span>Аудио этого фрагмента временно недоступно. Текст доступен на странице выше.</span></div>
        ) : null}

        <div>
          <input className="seek" type="range" min={0} max={Math.max(1, p.duration)} step={500} value={Math.min(pos, p.duration)} aria-label="Позиция воспроизведения"
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={() => { if (scrub != null) { p.seek(scrub); setScrub(null); } }}
            onKeyUp={() => { if (scrub != null) { p.seek(scrub); setScrub(null); } }}
            onTouchEnd={() => { if (scrub != null) { p.seek(scrub); setScrub(null); } }} />
          <div className="times"><span>{clock(pos)}</span><span>−{clock(Math.max(0, p.duration - pos))}</span></div>
        </div>

        <div className="controls">
          <button className="ctrl" aria-label="Предыдущая статья" onClick={() => p.prev()}><Icon name="prev" size={24} /></button>
          <button className="ctrl" aria-label="Назад на 15 секунд" onClick={() => p.skip(-15000)}><Icon name="back15" size={24} />15</button>
          <button className="ctrl big" aria-label={playing ? 'Пауза' : 'Воспроизвести'} onClick={() => p.toggle()} disabled={p.status === 'unavailable'}>
            {p.status === 'loading' ? <Spinner /> : <Icon name={playing ? 'pause' : 'play'} fill size={30} />}
          </button>
          <button className="ctrl" aria-label="Вперёд на 15 секунд" onClick={() => p.skip(15000)}><Icon name="fwd15" size={24} />15</button>
          <button className="ctrl" aria-label="Следующая статья" onClick={() => p.next()}><Icon name="next" size={24} /></button>
        </div>

        <div className="tools">
          <button className={`tool ${p.rate !== 1 ? 'on' : ''}`} onClick={() => setSheet('speed')}><b>{p.rate}×</b>Скорость</button>
          <button className={`tool ${p.sleep.kind !== 'off' ? 'on' : ''}`} onClick={() => setSheet('sleep')}>
            <Icon name="moon" size={20} />{p.sleep.kind === 'time' ? clock(sleepLeft) : p.sleep.kind === 'track' ? 'до конца' : 'Таймер сна'}
          </button>
          <button className="tool" onClick={() => setSheet('bookmark')}><Icon name="bookmark" size={20} />Закладка</button>
          <button className="tool" onClick={() => setSheet('chapters')}><Icon name="list" size={20} />Главы</button>
          <button className="tool" onClick={() => p.restart()}><Icon name="repeat" size={20} />Повторить</button>
          <button className="tool" disabled={!articleKey} onClick={() => articleKey && nav(`/memory/review?mode=article&key=${articleKey}`)}><Icon name="brain" size={20} />Проверить себя</button>
          <button className={`tool ${favorite ? 'on' : ''}`} disabled={!articleKey} onClick={toggleFavorite}><Icon name="star" fill={favorite} size={20} />{favorite ? 'В избранном' : 'Избранное'}</button>
          <button className="tool" onClick={() => setSheet('voice')}><Icon name="voice" size={20} />{p.playlist.voice?.title ?? 'Голос'}</button>
        </div>

        {voiceBeta ? (
          <div className="state-box info small"><Icon name="info" size={16} /><span>Бета-озвучка: системный синтезатор речи. Профессиональный голос готовится — текст и разметка произношения уже проверены.</span></div>
        ) : null}

      </div>

      <Sheet open={sheet === 'speed'} onClose={() => setSheet(null)} title="Скорость воспроизведения">
        {RATES.map((r) => (
          <button key={r} className={`option-row ${p.rate === r ? 'on' : ''}`} onClick={() => { p.setRate(r); setSheet(null); }}>
            {r}×{r === 1 ? ' — обычная' : r < 1 ? ' — медленнее' : ''}{p.rate === r ? <Icon name="check" /> : null}
          </button>
        ))}
      </Sheet>

      <Sheet open={sheet === 'sleep'} onClose={() => setSheet(null)} title="Таймер сна">
        {p.sleep.kind === 'time' ? <p className="muted">Остановится через {clock(sleepLeft)}</p> : null}
        {SLEEP.map((m) => <button key={m} className="option-row" onClick={() => { p.setSleep(m); setSheet(null); toast(`Таймер сна: ${m} мин`); }}>{m} минут</button>)}
        <button className={`option-row ${p.sleep.kind === 'track' ? 'on' : ''}`} onClick={() => { p.setSleep('track'); setSheet(null); }}>До конца статьи{p.sleep.kind === 'track' ? <Icon name="check" /> : null}</button>
        <button className="option-row" onClick={() => { p.setSleep('off'); setSheet(null); }}>Выключить таймер</button>
      </Sheet>

      <Sheet open={sheet === 'voice'} onClose={() => setSheet(null)} title="Голос">
        {p.playlist.voices.map((v) => (
          <button key={v.id} className={`option-row ${p.playlist?.voice?.id === v.id ? 'on' : ''}`} disabled={!v.available}
            onClick={async () => { setSheet(null); await p.setVoice(v.id); toast(`Голос: ${v.title}`); }}>
            <span className="grow" style={{ textAlign: 'left' }}>
              {v.title} {v.quality === 'beta' ? <span className="badge beta">бета</span> : null}
              <div className="hint">{v.available ? v.description : `${v.description}. Озвучка этим голосом скоро появится`}</div>
            </span>
            {p.playlist?.voice?.id === v.id ? <Icon name="check" /> : null}
          </button>
        ))}
        <p className="hint" style={{ marginTop: 10 }}>{p.playlist.voice?.license}</p>
      </Sheet>

      <Sheet open={sheet === 'bookmark'} onClose={() => setSheet(null)} title="Закладка">
        <p className="muted" style={{ marginTop: 0 }}>{p.track.title}, позиция {clock(p.position)}</p>
        <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Заметка (необязательно)" />
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={addBookmark}><Icon name="bookmark" size={18} /> Сохранить закладку</button>
      </Sheet>

      <ChaptersSheet open={sheet === 'chapters'} onClose={() => setSheet(null)} />
    </Screen>
  );
}

function ChaptersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toc = useToc();
  const p = usePlayer();
  const [chapter, setChapter] = useState<string | null>(null);
  const c = toc.data?.chapters.find((x) => x.key === chapter);
  return (
    <Sheet open={open} onClose={() => { setChapter(null); onClose(); }} title={c ? (c.number ? `Глава ${c.number}. ${c.title}` : c.title) : 'Главы'}>
      {!toc.data ? <p className="muted">Загрузка…</p> : !c ? (
        <>
          <button className="option-row" onClick={() => { p.playKey('intro'); onClose(); }}>Вступление<Icon name="play" fill size={14} /></button>
          {toc.data.chapters.map((x) => (
            <button key={x.key} className={`option-row ${p.track?.chapterKey === x.key ? 'on' : ''}`} onClick={() => setChapter(x.key)}>
              <span style={{ textAlign: 'left' }}>{x.number ? `${x.number}. ` : ''}{x.title}</span><Icon name="right" size={18} />
            </button>
          ))}
        </>
      ) : (
        <>
          <button className="option-row" onClick={() => setChapter(null)}><span><Icon name="left" size={16} /> Все главы</span></button>
          {c.articles.map((a) => (
            <button key={a.key} className={`option-row ${p.track?.key === a.key ? 'on' : ''}`} onClick={() => { p.playKey(a.key); setChapter(null); onClose(); }}>
              <span style={{ textAlign: 'left' }}>{a.title}{a.completed ? ' ✓' : ''}<div className="hint">{a.firstLine.slice(0, 70)}…</div></span>
              <Icon name="play" fill size={14} />
            </button>
          ))}
        </>
      )}
    </Sheet>
  );
}
