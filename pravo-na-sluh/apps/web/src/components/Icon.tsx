// Набор линейных иконок (inline SVG, без внешних зависимостей).

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.5l3.8 1-3.9 15-3.8-1z',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3 3 3 0 0 1-3-3',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  back15: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  fwd15: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  prev: 'M6 5v14M19 5 9 12l10 7z',
  next: 'M18 5v14M5 5l10 7-10 7z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  text: 'M4 6h16M4 10h16M4 14h10M4 18h12',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  check: 'M4 12.5 9.5 18 20 6',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 1 1 8 0v3',
  right: 'M9 5l7 7-7 7',
  left: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6 6 18',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  flame: 'M12 21c-4 0-7-2.7-7-6.5 0-3 2-5 3.5-6.5.3 2 1.3 3 2.5 3.5C11 8 12 5 15 3c0 3 4 5.5 4 10.5 0 4.3-3 7.5-7 7.5z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  vote: 'M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 6.5A2 2 0 0 1 17.8 20H7',
  repeat: 'M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3',
  quiz: 'M4 4h16v16H4zM8 12l3 3 5-6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  offline: 'M2 8.5a15 15 0 0 1 4.5-2.7M10 5.1A15 15 0 0 1 22 8.5M5 12a10 10 0 0 1 3-1.8M16 10.6a10 10 0 0 1 3 1.4M8.5 15.5a5 5 0 0 1 7 0M12 19h.01M3 3l18 18',
  speed: 'M12 20a8 8 0 1 1 8-8M12 12l4-4M3.5 12H5M12 3.5V5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.7M12 17h.01',
  doc: 'M6 3h9l5 5v13H6zM14 3v6h6M9 13h8M9 17h6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  voice: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z',
  card: 'M3 6h18v12H3zM3 10h18',
  gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7c-1.5-3-5-3.5-5.5-1.5S9 7 12 7zM12 7c1.5-3 5-3.5 5.5-1.5S15 7 12 7z',
  share: 'M12 15V3M7 8l5-5 5 5M5 13v7h14v-7',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
};

export function Icon({ name, size = 22, fill = false, className, title }: { name: keyof typeof PATHS | string; size?: number; fill?: boolean; className?: string; title?: string }) {
  const d = PATHS[name] ?? PATHS.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={fill ? 0 : 1.9}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
