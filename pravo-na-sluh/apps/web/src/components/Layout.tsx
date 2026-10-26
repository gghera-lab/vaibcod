// Нижняя навигация, мини-плеер и интеграция с системной кнопкой «Назад» Telegram.

import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clock } from '../lib/format.ts';
import { useMemoryOverview } from '../lib/hooks.ts';
import { haptic, inTelegram, tg } from '../lib/telegram.ts';
import { articleIsCurrent, usePlayer, type PlayerApi } from '../player/PlayerProvider.tsx';
import { Icon } from './Icon.tsx';

const TABS = [
  { path: '/', label: 'Главная', icon: 'home' },
  { path: '/library', label: 'Библиотека', icon: 'library' },
  { path: '/memory', label: 'Запоминание', icon: 'brain' },
  { path: '/favorites', label: 'Избранное', icon: 'star' },
  { path: '/profile', label: 'Профиль', icon: 'user' },
];
const ROOTS = new Set(TABS.map((t) => t.path));

function activeTab(pathname: string): string {
  if (pathname === '/') return '/';
  if (pathname.startsWith('/library') || pathname.startsWith('/doc') || pathname.startsWith('/constitution')) return '/library';
  if (pathname.startsWith('/memory')) return '/memory';
  if (pathname.startsWith('/favorites')) return '/favorites';
  if (pathname.startsWith('/profile') || pathname.startsWith('/pro') || pathname.startsWith('/legal') || pathname.startsWith('/admin')) return '/profile';
  return '';
}

export function TabBar() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const current = activeTab(pathname);
  const memory = useMemoryOverview();
  const due = memory.data?.dueNow ?? 0;
  if (pathname === '/player') return null;
  return (
    <nav className="tabbar" aria-label="Основные разделы">
      {TABS.map((t) => (
        <button key={t.path} className={`tab ${current === t.path ? 'active' : ''}`} aria-current={current === t.path ? 'page' : undefined}
          onClick={() => { haptic.select(); nav(t.path); }}>
          <Icon name={t.icon} size={24} />
          {t.path === '/memory' && due > 0 ? <span className="dot">{due > 99 ? '99+' : due}</span> : null}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Мини-плеер не нужен в полном плеере и на странице статьи, которая сейчас звучит (там свой плеер). */
function miniVisible(p: PlayerApi, pathname: string): boolean {
  if (!p.track || pathname === '/player') return false;
  const m = pathname.match(/^\/constitution\/([^/]+)$/);
  return !(m && articleIsCurrent(p, decodeURIComponent(m[1])));
}

export function MiniPlayer() {
  const p = usePlayer();
  const nav = useNavigate();
  const { pathname } = useLocation();
  if (!p.track || !miniVisible(p, pathname)) return null;
  const pct = p.duration ? (p.position / p.duration) * 100 : 0;
  const playing = p.status === 'playing' || p.status === 'loading';
  return (
    <div className="mini-player">
      <div className="mini-inner" onClick={() => nav('/player')} role="button" aria-label="Открыть плеер">
        <div className="grow">
          <div className="title ellipsis">{p.track.title}</div>
          <div className="sub ellipsis">
            {p.status === 'error' ? 'Ошибка загрузки — нажмите, чтобы повторить' : p.status === 'offline' ? 'Нет подключения' : `Конституция РФ · ${clock(p.position)} / ${clock(p.duration)}`}
          </div>
        </div>
        <button className="play-fab" aria-label={playing ? 'Пауза' : 'Слушать'} onClick={(e) => { e.stopPropagation(); p.toggle(); }}>
          <Icon name={playing ? 'pause' : 'play'} fill size={20} />
        </button>
        <span className="bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Системная кнопка «Назад» Telegram на вложенных экранах. */
export function useTelegramBackButton() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    if (!inTelegram) return;
    const handler = () => (window.history.length > 1 ? nav(-1) : nav('/'));
    if (ROOTS.has(pathname)) tg!.BackButton.hide();
    else {
      tg!.BackButton.show();
      tg!.BackButton.onClick(handler);
    }
    return () => tg!.BackButton.offClick(handler);
  }, [pathname, nav]);
}

export function useHasMini() {
  const p = usePlayer();
  const { pathname } = useLocation();
  return miniVisible(p, pathname);
}

/** Контейнер экрана с отступами под нижнее меню и мини-плеер. */
export function Screen({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const mini = useHasMini();
  return <main className={`screen ${mini ? 'has-mini' : ''} ${className}`}>{children}</main>;
}
