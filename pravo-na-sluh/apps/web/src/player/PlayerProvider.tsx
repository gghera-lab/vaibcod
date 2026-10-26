// Глобальный аудиоплеер: один <audio> на всё приложение.
//
// Два режима источника:
//  • «книга» — непрерывный файл всей Конституции; статьи — участки файла (смещения из манифеста).
//    Источник не меняется между статьями, поэтому прослушивание не прерывается при свёрнутом
//    приложении и заблокированном экране (WebView не запускает новые файлы в фоне);
//  • «по статьям» — отдельный файл на каждую статью (запасной режим, если файла книги нет).
//
// Позиция и длительность в интерфейсе — всегда внутри текущего трека (статьи).
// Учитывается только фактически прослушанное время (перемотка не засчитывается).

import type { PlaylistDto, ProgressDto, TrackDto } from '@pravo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { track as trackEvent } from '../lib/analytics.ts';
import { api, get, patch } from '../lib/api.ts';
import { load, save } from '../lib/storage.ts';
import { haptic } from '../lib/telegram.ts';
import { playChime } from './chime.ts';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'offline' | 'unavailable';
export type SleepMode = { kind: 'off' } | { kind: 'time'; endsAt: number; minutes: number } | { kind: 'track' };

export interface PlayerSettings {
  playbackRate: number;
  autoAdvance: boolean;
  chapterChime: boolean;
  voiceId: string | null;
}

export interface PlayerApi {
  playlist: PlaylistDto | null;
  playlistError: string | null;
  track: TrackDto | null;
  index: number;
  status: PlayerStatus;
  position: number;
  duration: number;
  rate: number;
  sleep: SleepMode;
  error: string | null;
  ready: boolean;
  /** Играет непрерывный файл книги (фоновое прослушивание без пауз между статьями). */
  bookMode: boolean;
  currentUnitId: string | null;
  /** Загрузить трек по ключу (статья/вступление). autoplay=false — просто подготовить. */
  playKey(key: string, opts?: { positionMs?: number; autoplay?: boolean }): void;
  toggle(): void;
  pause(): void;
  seek(ms: number): void;
  skip(deltaMs: number): void;
  next(): void;
  prev(): void;
  restart(): void;
  setRate(r: number): void;
  setSleep(mode: 'off' | 'track' | number): void;
  setVoice(id: string): Promise<void>;
  retry(): void;
  reloadPlaylist(): Promise<void>;
}

const Ctx = createContext<PlayerApi | null>(null);
export const usePlayer = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlayer вне PlayerProvider');
  return c;
};

/** Звучит ли статья key: сама статья или заставка главы прямо перед ней. */
export function articleIsCurrent(p: Pick<PlayerApi, 'track' | 'playlist' | 'index'>, key: string): boolean {
  if (!p.track) return false;
  if (p.track.articleKey === key || p.track.key === key) return true;
  return p.track.kind === 'chapter_intro' && p.playlist?.tracks[p.index + 1]?.articleKey === key;
}

const LOCAL_KEY = 'last-position';
const SAVE_EVERY_MS = 10_000;

// ── Геометрия источника: где начинается трек в файле и сколько он длится.
function isBook(pl: PlaylistDto | null): boolean {
  return !!pl?.book && pl.tracks.every((t) => t.bookOffsetMs != null);
}
function startOf(pl: PlaylistDto, i: number): number {
  return isBook(pl) ? pl.tracks[i].bookOffsetMs! : 0;
}
function spanOf(pl: PlaylistDto, i: number): number {
  if (!isBook(pl)) return pl.tracks[i].durationMs;
  const next = pl.tracks[i + 1];
  return (next ? next.bookOffsetMs! : pl.book!.durationMs) - pl.tracks[i].bookOffsetMs!;
}
function srcOf(pl: PlaylistDto, i: number): string {
  return isBook(pl) ? pl.book!.url : pl.tracks[i].url;
}
/** Индекс трека, которому принадлежит абсолютная позиция в файле книги. */
function indexAt(pl: PlaylistDto, absMs: number): number {
  let lo = 0, hi = pl.tracks.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pl.tracks[mid].bookOffsetMs! <= absMs + 1) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function PlayerProvider({ children, settings, enabled }: { children: ReactNode; settings: PlayerSettings | null; enabled: boolean }) {
  const qc = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistDto | null>(null);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [index, setIndex] = useState(-1);
  const [status, setStatus] = useState<PlayerStatus>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(settings?.playbackRate ?? 1);
  const [sleep, setSleepState] = useState<SleepMode>({ kind: 'off' });
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Изменяемые значения для обработчиков событий <audio>.
  const r = useRef({
    playlist: null as PlaylistDto | null,
    index: -1,
    src: '',
    lastTime: 0,
    listenedDelta: 0,
    lastSave: 0,
    pendingSeek: null as number | null,
    startedTracks: new Set<string>(),
    sessionStarted: false,
    settings,
    sleep: { kind: 'off' } as SleepMode,
    sleepTimer: 0 as number,
    wantPlaying: false,
    rate: settings?.playbackRate ?? 1,
    chiming: false,
  });
  r.current.settings = settings;
  r.current.rate = rate;

  const currentTrack = playlist && index >= 0 ? playlist.tracks[index] ?? null : null;

  // ── Сохранение прогресса трека i (позиция — внутри трека)
  const saveProgressFor = useCallback(async (i: number, positionMs: number, event: 'tick' | 'pause' | 'ended' | 'seek' | 'start', keepalive = false) => {
    const pl = r.current.playlist;
    const t = pl?.tracks[i];
    if (!pl || !t) return;
    const listenedDeltaMs = Math.round(r.current.listenedDelta);
    r.current.listenedDelta = 0;
    r.current.lastSave = Date.now();
    const pos = Math.max(0, Math.round(positionMs));
    save(LOCAL_KEY, { trackKey: t.key, positionMs: pos, voiceId: pl.voice?.id, at: Date.now() });
    try {
      const res = await api<{ justCompleted: boolean }>('/api/progress/constitution', {
        method: 'PUT', keepalive,
        body: { trackKey: t.key, positionMs: pos, listenedDeltaMs, voiceId: pl.voice?.id, event },
      });
      if (res?.justCompleted) {
        trackEvent('article_complete', { article: t.articleKey });
        void qc.invalidateQueries({ queryKey: ['toc'] });
        void qc.invalidateQueries({ queryKey: ['stats'] });
        void qc.invalidateQueries({ queryKey: ['memory-overview'] });
      }
    } catch {
      // Не удалось — вернём несохранённое время, отправим со следующей попыткой.
      r.current.listenedDelta += listenedDeltaMs;
    }
  }, [qc]);

  const positionInTrack = () => {
    const a = audioRef.current;
    const pl = r.current.playlist;
    if (!a || !pl || r.current.index < 0) return 0;
    return a.currentTime * 1000 - startOf(pl, r.current.index);
  };
  const saveProgress = useCallback((event: 'tick' | 'pause' | 'ended' | 'seek' | 'start', keepalive = false) =>
    saveProgressFor(r.current.index, positionInTrack(), event, keepalive), [saveProgressFor]);

  const updateMediaSession = (t: TrackDto, pl: PlaylistDto) => {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: 'Конституция Российской Федерации', album: `Право на слух · ${pl.voice?.title ?? ''}` });
    } catch { /* старые WebView */ }
  };

  const onPlayRejected = (e: unknown) => {
    // Автовоспроизведение без жеста пользователя может быть запрещено WebView — ждём нажатия.
    if ((e as DOMException)?.name === 'NotAllowedError') setStatus('paused');
  };

  const enterTrack = (i: number) => {
    const pl = r.current.playlist!;
    r.current.index = i;
    setIndex(i);
    setDuration(spanOf(pl, i));
    updateMediaSession(pl.tracks[i], pl);
  };

  // ── Переход к треку i и позиции внутри него
  const loadIndex = useCallback((i: number, positionMs = 0, autoplay = false) => {
    const pl = r.current.playlist;
    const a = audioRef.current;
    if (!pl || !a || i < 0 || i >= pl.tracks.length) return;
    const t = pl.tracks[i];
    if (r.current.index >= 0 && r.current.index !== i && r.current.listenedDelta > 0) void saveProgress('tick');
    enterTrack(i);
    setPosition(positionMs);
    setError(null);
    r.current.listenedDelta = 0;
    const src = srcOf(pl, i);
    if (!src || !t.url) {
      a.pause();
      a.removeAttribute('src');
      r.current.src = '';
      a.load();
      setStatus('unavailable');
      return;
    }
    const absSec = (startOf(pl, i) + positionMs) / 1000;
    r.current.wantPlaying = autoplay;
    r.current.lastTime = absSec;
    if (r.current.src !== src) {
      r.current.src = src;
      r.current.pendingSeek = absSec;
      setStatus(autoplay ? 'loading' : 'paused');
      a.src = src;
      a.playbackRate = r.current.rate;
      a.load();
    } else {
      if (a.readyState >= 1) a.currentTime = absSec;
      else r.current.pendingSeek = absSec;
      if (!autoplay && !a.paused) a.pause();
      if (!autoplay) setStatus('paused');
    }
    if (autoplay) {
      setStatus((s) => (s === 'playing' ? s : 'loading'));
      void a.play().catch(onPlayRejected);
    }
  }, [saveProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Создание <audio> и подписка на события
  useEffect(() => {
    const a = new Audio();
    a.preload = 'metadata';
    audioRef.current = a;

    const onLoaded = () => {
      if (r.current.pendingSeek != null) {
        try { a.currentTime = r.current.pendingSeek; } catch { /* ignore */ }
        r.current.lastTime = r.current.pendingSeek;
        r.current.pendingSeek = null;
      }
      const pl = r.current.playlist;
      if (pl && !isBook(pl) && Number.isFinite(a.duration) && a.duration > 0) setDuration(Math.round(a.duration * 1000));
    };

    const onTime = () => {
      const pl = r.current.playlist;
      if (!pl || r.current.index < 0 || r.current.pendingSeek != null) return;
      const now = a.currentTime;
      const diff = now - r.current.lastTime;
      const continuous = !a.paused && diff > 0 && diff < 1.5 * a.playbackRate + 0.5;
      r.current.lastTime = now;

      if (isBook(pl)) {
        const i = indexAt(pl, now * 1000);
        if (i !== r.current.index) {
          const prev = r.current.index;
          const naturally = continuous && i === prev + 1;
          if (naturally) {
            // Дослушали трек до конца — фиксируем его и решаем, продолжать ли.
            r.current.listenedDelta += diff * 1000;
            void saveProgressFor(prev, spanOf(pl, prev), 'ended');
            const stopHere = r.current.sleep.kind === 'track' || !(r.current.settings?.autoAdvance ?? true);
            enterTrack(i);
            setPosition(0);
            if (stopHere) {
              if (r.current.sleep.kind === 'track') setSleepInternal({ kind: 'off' });
              r.current.wantPlaying = false;
              a.pause();
              a.currentTime = startOf(pl, i) / 1000;
              r.current.lastTime = a.currentTime;
              return;
            }
            const next = pl.tracks[i];
            // Сигнал перед новой главой — только когда приложение на экране (в фоне не прерываем звук).
            if (next.kind === 'chapter_intro' && (r.current.settings?.chapterChime ?? true) && document.visibilityState === 'visible' && !r.current.chiming) {
              r.current.chiming = true;
              a.pause();
              void playChime().then(() => {
                r.current.chiming = false;
                if (r.current.wantPlaying) void a.play().catch(onPlayRejected);
              });
            }
            r.current.startedTracks.add(next.key);
            void saveProgressFor(i, 0, 'start');
          } else {
            if (r.current.listenedDelta > 0) void saveProgressFor(prev, spanOf(pl, prev), 'tick');
            enterTrack(i);
          }
          setPosition(Math.max(0, Math.round(now * 1000 - startOf(pl, i))));
          return;
        }
      }
      if (continuous) r.current.listenedDelta += diff * 1000;
      setPosition(Math.max(0, Math.round(now * 1000 - startOf(pl, r.current.index))));
      if (!a.paused && Date.now() - r.current.lastSave > SAVE_EVERY_MS) void saveProgress('tick');
    };

    const onPlaying = () => {
      setStatus('playing');
      setError(null);
      const t = r.current.playlist?.tracks[r.current.index];
      if (t && !r.current.startedTracks.has(t.key)) {
        r.current.startedTracks.add(t.key);
        void saveProgress('start');
      }
      if (!r.current.sessionStarted) {
        r.current.sessionStarted = true;
        trackEvent('listen_start', { track: t?.key ?? null });
      }
    };
    const onPause = () => {
      if (a.ended || r.current.chiming) return;
      setStatus((s) => (s === 'error' || s === 'offline' || s === 'unavailable' ? s : 'paused'));
      void saveProgress('pause');
    };
    const onWaiting = () => { if (r.current.wantPlaying) setStatus('loading'); };
    const onError = () => {
      if (!a.getAttribute('src')) return;
      r.current.wantPlaying = false;
      const offline = !navigator.onLine;
      setStatus(offline ? 'offline' : 'error');
      setError(offline ? 'Нет подключения к интернету' : 'Не удалось загрузить аудио');
      trackEvent('playback_error', { track: r.current.playlist?.tracks[r.current.index]?.key ?? null, offline, code: a.error?.code ?? null });
    };
    const onEnded = async () => {
      const pl = r.current.playlist;
      await saveProgressFor(r.current.index, pl ? spanOf(pl, r.current.index) : 0, 'ended');
      if (!pl || isBook(pl)) { r.current.wantPlaying = false; setStatus('paused'); return; }
      // Режим «по статьям»: переходим к следующему файлу.
      if (r.current.sleep.kind === 'track') { setSleepInternal({ kind: 'off' }); setStatus('paused'); return; }
      if (!(r.current.settings?.autoAdvance ?? true)) { setStatus('paused'); return; }
      const nextI = r.current.index + 1;
      if (nextI >= pl.tracks.length) { setStatus('paused'); return; }
      if (pl.tracks[nextI].kind === 'chapter_intro' && (r.current.settings?.chapterChime ?? true)) await playChime();
      loadIndex(nextI, 0, true);
    };
    a.addEventListener('loadedmetadata', onLoaded);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('playing', onPlaying);
    a.addEventListener('pause', onPause);
    a.addEventListener('waiting', onWaiting);
    a.addEventListener('error', onError);
    a.addEventListener('ended', onEnded);

    const onHide = () => { if (document.visibilityState === 'hidden' && !a.paused) void saveProgress('tick', true); };
    const onOnline = () => setStatus((s) => (s === 'offline' ? 'paused' : s));
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', onOnline);
    return () => {
      a.pause();
      a.removeEventListener('loadedmetadata', onLoaded);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('playing', onPlaying);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('waiting', onWaiting);
      a.removeEventListener('error', onError);
      a.removeEventListener('ended', onEnded);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', onOnline);
    };
  }, [loadIndex, saveProgress, saveProgressFor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Плейлист и восстановление места остановки
  const reloadPlaylist = useCallback(async (voice?: string) => {
    try {
      setPlaylistError(null);
      const pl = await get<PlaylistDto>(`/api/constitution/playlist${voice ? `?voice=${encodeURIComponent(voice)}` : ''}`);
      r.current.playlist = pl;
      r.current.src = '';
      setPlaylist(pl);
      return pl;
    } catch (e) {
      setPlaylistError(e instanceof Error ? e.message : 'Не удалось загрузить плейлист');
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const pl = await reloadPlaylist();
      if (cancelled || !pl) { setReady(true); return; }
      if (pl.status === 'unavailable') { setStatus('unavailable'); setReady(true); return; }
      let progress: ProgressDto | null = null;
      try { progress = (await get<{ progress: ProgressDto | null }>('/api/progress/constitution')).progress; } catch { /* офлайн */ }
      const local = load<{ trackKey: string; positionMs: number; at: number } | null>(LOCAL_KEY, null);
      const serverAt = progress ? new Date(progress.updatedAt).getTime() : 0;
      const src = local && local.at > serverAt + 5000 ? local : progress;
      const i = src ? pl.tracks.findIndex((t) => t.key === src.trackKey) : -1;
      if (!cancelled && i >= 0) loadIndex(i, src!.positionMs, false);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [enabled, reloadPlaylist, loadIndex]);

  // Скорость из настроек пользователя
  useEffect(() => {
    if (settings?.playbackRate) {
      setRateState(settings.playbackRate);
      if (audioRef.current) audioRef.current.playbackRate = settings.playbackRate;
    }
  }, [settings?.playbackRate]);

  // ── Таймер сна
  function setSleepInternal(m: SleepMode) {
    r.current.sleep = m;
    setSleepState(m);
    if (r.current.sleepTimer) { clearTimeout(r.current.sleepTimer); r.current.sleepTimer = 0; }
    if (m.kind === 'time') r.current.sleepTimer = window.setTimeout(fadeOutAndPause, Math.max(0, m.endsAt - Date.now()));
  }
  function fadeOutAndPause() {
    const a = audioRef.current;
    if (!a) return;
    const start = a.volume;
    let step = 0;
    const iv = window.setInterval(() => {
      step++;
      a.volume = Math.max(0, start * (1 - step / 20));
      if (step >= 20) {
        clearInterval(iv);
        r.current.wantPlaying = false;
        a.pause();
        a.volume = start;
        setSleepInternal({ kind: 'off' });
      }
    }, 200);
  }

  const apiObj = useMemo<PlayerApi>(() => {
    const a = () => audioRef.current;
    const findIndex = (key: string) => r.current.playlist?.tracks.findIndex((t) => t.key === key) ?? -1;
    const playing = status === 'playing' || status === 'loading';
    const play = () => {
      const el = a();
      if (!el) return;
      if (!el.getAttribute('src')) {
        const i = r.current.index >= 0 ? r.current.index : 0;
        loadIndex(i, r.current.index >= 0 ? position : 0, true);
        return;
      }
      r.current.wantPlaying = true;
      if (status !== 'playing') setStatus('loading');
      void el.play().catch(onPlayRejected);
      if (r.current.sessionStarted) trackEvent('listen_resume', { track: r.current.playlist?.tracks[r.current.index]?.key ?? null });
    };
    const pause = () => {
      r.current.wantPlaying = false;
      a()?.pause();
      trackEvent('listen_pause');
    };
    const seek = (ms: number) => {
      const el = a();
      const pl = r.current.playlist;
      if (!el || !pl || r.current.index < 0) return;
      const within = Math.max(0, Math.min(ms, duration - 50));
      const abs = (startOf(pl, r.current.index) + within) / 1000;
      if (el.readyState >= 1) el.currentTime = abs;
      else r.current.pendingSeek = abs;
      r.current.lastTime = abs;
      setPosition(Math.round(within));
      void saveProgress('seek');
    };
    return {
      playlist, playlistError, track: currentTrack, index, status, position, duration, rate, sleep, error, ready,
      bookMode: isBook(playlist),
      currentUnitId: currentTrack?.segments.find((s) => position >= s.startMs - 150 && position < s.endMs + 400)?.unitId ?? null,
      playKey(key, opts) {
        const i = findIndex(key);
        if (i < 0) return;
        haptic.tap();
        if (i === r.current.index && a()?.getAttribute('src') && opts?.positionMs == null) {
          if (opts?.autoplay !== false) play();
          return;
        }
        loadIndex(i, opts?.positionMs ?? 0, opts?.autoplay !== false);
      },
      toggle() {
        haptic.tap();
        if (playing) pause();
        else play();
      },
      pause,
      seek,
      skip(delta) { seek(position + delta); },
      next() {
        const pl = r.current.playlist;
        if (!pl) return;
        let i = r.current.index + 1;
        while (i < pl.tracks.length && pl.tracks[i].kind === 'chapter_intro') i++;
        if (i < pl.tracks.length) loadIndex(i, 0, playing);
      },
      prev() {
        const pl = r.current.playlist;
        if (!pl) return;
        if (position > 4000) { seek(0); return; }
        let i = r.current.index - 1;
        while (i > 0 && pl.tracks[i].kind === 'chapter_intro') i--;
        if (i >= 0) loadIndex(i, 0, playing);
      },
      restart() {
        trackEvent('article_replay', { track: currentTrack?.key ?? null });
        seek(0);
        play();
      },
      setRate(v) {
        setRateState(v);
        const el = a();
        if (el) el.playbackRate = v;
        trackEvent('speed_change', { rate: v });
        void patch('/api/me/settings', { playbackRate: v }).catch(() => {});
      },
      setSleep(m) {
        if (m === 'off') setSleepInternal({ kind: 'off' });
        else if (m === 'track') setSleepInternal({ kind: 'track' });
        else setSleepInternal({ kind: 'time', minutes: m, endsAt: Date.now() + m * 60_000 });
        trackEvent('sleep_timer_set', { mode: String(m) });
      },
      async setVoice(id) {
        const wasPlaying = playing;
        const unit = currentTrack?.segments.find((s) => position >= s.startMs && position < s.endMs);
        const key = currentTrack?.key;
        a()?.pause();
        await patch('/api/me/settings', { voiceId: id }).catch(() => {});
        const pl = await reloadPlaylist(id);
        trackEvent('voice_change', { voice: id });
        if (!pl || !key) return;
        const i = pl.tracks.findIndex((t) => t.key === key);
        // Перенос позиции: начало того же фрагмента текста в треке другого голоса.
        const seg = unit ? pl.tracks[i]?.segments.find((s) => s.id === unit.id) : null;
        if (i >= 0) loadIndex(i, seg?.startMs ?? 0, wasPlaying);
      },
      retry() {
        const i = r.current.index;
        r.current.src = '';
        if (i >= 0) loadIndex(i, position, true);
        else void reloadPlaylist();
      },
      async reloadPlaylist() { await reloadPlaylist(); },
    };
  }, [playlist, playlistError, currentTrack, index, status, position, duration, rate, sleep, error, ready, loadIndex, saveProgress, reloadPlaylist]); // eslint-disable-line react-hooks/exhaustive-deps

  // Обработчики Media Session ссылаются на актуальный API.
  const apiRef = useRef(apiObj);
  apiRef.current = apiObj;
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, h: MediaSessionActionHandler) => { try { ms.setActionHandler(action, h); } catch { /* не поддерживается */ } };
    set('play', () => apiRef.current.toggle());
    set('pause', () => apiRef.current.pause());
    set('seekbackward', () => apiRef.current.skip(-15000));
    set('seekforward', () => apiRef.current.skip(15000));
    set('previoustrack', () => apiRef.current.prev());
    set('nexttrack', () => apiRef.current.next());
  }, []);

  return <Ctx.Provider value={apiObj}>{children}</Ctx.Provider>;
}
