// общие детали монтажа: шрифты, последовательности кадров, титры, штамп, зерно, виньетка, звук-эффекты
import React from 'react';
import { AbsoluteFill, Img, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, continueRender, delayRender, Easing } from 'remotion';
import SEQ from './seq.json';

export const FPS = 30;
export const C = { ink: '#0d0a12', cream: '#f4e9cf', gold: '#e2b45a', goldD: '#9a6f2a', red: '#c8312b', paper: '#efe4c9' };

// ---------- шрифты игры (встроены, OFL) ----------
const FONTS: [string, string, string, string][] = [
  ['PT Serif', 'PTSerif-normal-400.woff2', '400', 'normal'], ['PT Serif', 'PTSerif-normal-700.woff2', '700', 'normal'], ['PT Serif', 'PTSerif-italic-400.woff2', '400', 'italic'],
  ['PT Sans', 'PTSans-normal-400.woff2', '400', 'normal'], ['PT Sans', 'PTSans-normal-700.woff2', '700', 'normal'],
  ['Balsamiq Sans', 'BalsamiqSans-normal-700.woff2', '700', 'normal'], ['Press Start 2P', 'PressStart2P-normal-400.woff2', '400', 'normal'],
];
let fontsReady = false;
export const useFonts = () => {
  const [h] = React.useState(() => (fontsReady ? null : delayRender('fonts')));
  React.useEffect(() => {
    if (!h) return;
    Promise.all(FONTS.map(([fam, file, w, st]) => { const f = new FontFace(fam, `url(${staticFile('fonts/' + file)})`, { weight: w, style: st }); return f.load().then((x) => { document.fonts.add(x); }); }))
      .then(() => { fontsReady = true; continueRender(h); }).catch(() => continueRender(h));
  }, [h]);
};
export const SERIF = '"PT Serif", Georgia, serif', SANS = '"PT Sans", Arial, sans-serif', CAP = '"Balsamiq Sans", "PT Sans", sans-serif', PIX = '"Press Start 2P", monospace';

// ---------- последовательность кадров из игры ----------
const idx = SEQ as unknown as Record<string, [string, number][]>;
export const seqDur = (name: string) => { const a = idx[name]; return a ? a[a.length - 1][1] : 0; };
export const Seq: React.FC<{ name: string; from?: number; speed?: number; style?: React.CSSProperties; pixel?: boolean }> = ({ name, from = 0, speed = 1, style, pixel }) => {
  const frame = useCurrentFrame(); const a = idx[name];
  if (!a) return <AbsoluteFill style={{ background: '#300', color: '#fff', fontSize: 40 }}>нет {name}</AbsoluteFill>;
  const t = Math.min(from + (frame / FPS) * speed, a[a.length - 1][1]);
  let lo = 0, hi = a.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m][1] <= t) lo = m; else hi = m - 1; }
  return <Img src={staticFile(`seq/${name}/${a[lo][0]}`)} style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: pixel ? 'pixelated' : 'auto', ...style }} />;
};
export const Pic: React.FC<{ src: string; style?: React.CSSProperties; pixel?: boolean }> = ({ src, style, pixel }) => (
  <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: pixel ? 'pixelated' : 'auto', ...style }} />
);

// ---------- движение камеры: наезд/панорама ----------
export const Cam: React.FC<{ dur: number; z?: [number, number]; x?: [number, number]; y?: [number, number]; origin?: string; children: React.ReactNode }> = ({ dur, z = [1, 1.08], x = [0, 0], y = [0, 0], origin = '50% 50%', children }) => {
  const f = useCurrentFrame(); const k = interpolate(f, [0, dur], [0, 1], { extrapolateRight: 'clamp', easing: Easing.inOut(Easing.sin) });
  const s = z[0] + (z[1] - z[0]) * k, tx = x[0] + (x[1] - x[0]) * k, ty = y[0] + (y[1] - y[0]) * k;
  return <AbsoluteFill style={{ overflow: 'hidden' }}><AbsoluteFill style={{ transform: `translate(${tx}px,${ty}px) scale(${s})`, transformOrigin: origin }}>{children}</AbsoluteFill></AbsoluteFill>;
};

// ---------- появление/исчезновение кадра ----------
export const Fade: React.FC<{ dur: number; inn?: number; out?: number; children: React.ReactNode; color?: string }> = ({ dur, inn = 0, out = 0, children }) => {
  const f = useCurrentFrame();
  const o = Math.min(inn ? interpolate(f, [0, inn], [0, 1], { extrapolateRight: 'clamp' }) : 1, out ? interpolate(f, [dur - out, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1);
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};
// вспышка на склейке
export const Flash: React.FC<{ len?: number; color?: string; peak?: number }> = ({ len = 8, color = '#fff6dc', peak = .85 }) => {
  const f = useCurrentFrame(); return <AbsoluteFill style={{ background: color, opacity: interpolate(f, [0, len], [peak, 0], { extrapolateRight: 'clamp' }), pointerEvents: 'none' }} />;
};

// ---------- титры ----------
export const Title: React.FC<{ text: string; sub?: string; dur: number; y?: number; size?: number; italic?: boolean; align?: 'center' | 'left'; x?: number; color?: string }> = ({ text, sub, dur, y = 780, size = 72, italic, align = 'center', x = 0, color = C.cream }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const s = spring({ frame: f, fps, config: { damping: 200 }, durationInFrames: 16 });
  const o = Math.min(s, interpolate(f, [dur - 10, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const line = interpolate(f, [4, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: y, left: align === 'center' ? 0 : x, right: align === 'center' ? 0 : undefined, textAlign: align, opacity: o, transform: `translateY(${(1 - s) * 24}px)` }}>
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontStyle: italic ? 'italic' : 'normal', fontSize: size, color, letterSpacing: '.01em', lineHeight: 1.12, textShadow: '0 4px 24px rgba(0,0,0,.85), 0 2px 0 rgba(0,0,0,.6)', whiteSpace: 'pre-line' }}>{text}</div>
        <div style={{ height: 3, width: 220 * line, background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)`, margin: align === 'center' ? '18px auto 0' : '18px 0 0' }} />
        {sub && <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 26, letterSpacing: '.28em', textTransform: 'uppercase', color: C.gold, marginTop: 14, textShadow: '0 2px 12px rgba(0,0,0,.9)' }}>{sub}</div>}
      </div>
    </AbsoluteFill>
  );
};
// цитата персонажа с «печатающимся» текстом
export const Quote: React.FC<{ text: string; who: string; dur: number; y?: number; size?: number }> = ({ text, who, dur, y = 760, size = 54 }) => {
  const f = useCurrentFrame();
  const n = Math.floor(interpolate(f, [4, Math.min(dur - 20, 4 + text.length * 1.1)], [0, text.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const o = Math.min(interpolate(f, [0, 8], [0, 1], { extrapolateRight: 'clamp' }), interpolate(f, [dur - 8, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 160, right: 160, top: y, textAlign: 'center', opacity: o }}>
        <div style={{ display: 'inline-block', background: 'rgba(13,10,18,.78)', border: `2px solid ${C.goldD}`, borderRadius: 6, padding: '22px 40px 20px', boxShadow: '0 10px 40px rgba(0,0,0,.5)' }}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: size, color: C.cream, lineHeight: 1.2 }}>«{text.slice(0, n)}{n >= text.length ? '»' : <span style={{ opacity: 0 }}>{text.slice(n)}»</span>}</div>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 22, letterSpacing: '.24em', textTransform: 'uppercase', color: C.gold, marginTop: 10 }}>— {who}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
// красный резиновый штамп, падающий на экран
export const Stamp: React.FC<{ text: string; sub?: string; x?: number; y?: number; rot?: number; size?: number; delay?: number }> = ({ text, sub, x = 960, y = 540, rot = -8, size = 150, delay = 0 }) => {
  const f = useCurrentFrame() - delay; const { fps } = useVideoConfig(); if (f < 0) return null;
  const s = spring({ frame: f, fps, config: { damping: 11, stiffness: 260, mass: .7 } });
  const sc = interpolate(s, [0, 1], [3.2, 1]); const o = interpolate(f, [0, 3], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translate(-50%,-50%) rotate(${rot}deg) scale(${sc})`, opacity: o * .93, mixBlendMode: 'normal' }}>
      <div style={{ border: `${size * .06}px solid ${C.red}`, borderRadius: size * .12, padding: `${size * .08}px ${size * .28}px`, color: C.red, fontFamily: SANS, fontWeight: 700, fontSize: size, letterSpacing: '.08em', lineHeight: 1, textAlign: 'center', boxShadow: `inset 0 0 0 ${size * .025}px rgba(200,49,43,.0)`, filter: 'url(#rough)', WebkitMaskImage: 'radial-gradient(circle at 30% 40%, #000 55%, rgba(0,0,0,.7) 75%, #000 100%)' }}>
        {text}{sub && <div style={{ fontSize: size * .22, letterSpacing: '.3em', marginTop: size * .06 }}>{sub}</div>}
      </div>
    </div>
  );
};
export const Rough: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }}><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" /><feDisplacementMap in="SourceGraphic" scale="5" /></filter></svg>
);
// тряска кадра после удара
export const Shake: React.FC<{ at: number[]; amp?: number; children: React.ReactNode }> = ({ at, amp = 18, children }) => {
  const f = useCurrentFrame(); let dx = 0, dy = 0;
  for (const a of at) { const d = f - a; if (d >= 0 && d < 12) { const k = (1 - d / 12) * amp; dx += Math.sin(d * 2.7 + a) * k; dy += Math.cos(d * 3.3 + a) * k; } }
  return <AbsoluteFill style={{ transform: `translate(${dx}px,${dy}px)` }}>{children}</AbsoluteFill>;
};
// плёночное зерно + виньетка + полосы кадра
export const Grain: React.FC<{ o?: number }> = ({ o = .07 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <svg width="1920" height="1080" style={{ position: 'absolute', opacity: o, mixBlendMode: 'overlay' }}><filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed={f % 17} /></filter><rect width="100%" height="100%" filter="url(#g)" /></svg>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.55) 100%)' }} />
    </AbsoluteFill>
  );
};
export const Bars: React.FC<{ h: number }> = ({ h }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h, background: '#000' }} />
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: h, background: '#000' }} />
  </AbsoluteFill>
);
// сбой сигнала (для бункера)
export const Glitch: React.FC<{ children: React.ReactNode; k?: number }> = ({ children, k = 1 }) => {
  const f = useCurrentFrame(); const j = ((f * 7919) % 13) / 13; const on = j > .55;
  const dx = on ? (j - .5) * 40 * k : 0;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ filter: 'saturate(.6) contrast(1.15)' }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${dx}px)`, mixBlendMode: 'screen', opacity: on ? .5 : .15, filter: 'hue-rotate(-60deg)' }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.28) 0 2px, transparent 2px 5px)' }} />
      {on && <div style={{ position: 'absolute', left: 0, right: 0, top: (j * 1000) % 1000, height: 30 + j * 60, background: 'rgba(120,255,180,.08)' }} />}
    </AbsoluteFill>
  );
};

// ---------- звук ----------
const MASTER = .7; // общий уровень микса: запас до 0 дБ
import SFXM from './audio_sfx_all.json';
import VOXM from './audio_voice_all.json';
const sfxMarks = SFXM as Record<string, number>; const voxMarks = VOXM as Record<string, number>;
const sfxNames = Object.keys(sfxMarks).sort((a, b) => sfxMarks[a] - sfxMarks[b]);
// эффект из общей записи всех эффектов движка: вырезаем отрезок от отметки до следующей
export const Sfx: React.FC<{ name: string; at: number; vol?: number; len?: number }> = ({ name, at, vol = 1, len }) => {
  const s = sfxMarks[name]; if (s == null) return null;
  const nx = sfxNames[sfxNames.indexOf(name) + 1]; const end = len != null ? s + len : nx ? sfxMarks[nx] - .05 : s + 2;
  const from = Math.max(0, Math.round((s - .02) * FPS)), to = Math.round(end * FPS);
  return <Sequence from={at} durationInFrames={to - from} layout="none"><Audio src={staticFile('audio/sfx_all.wav')} startFrom={from} endAt={to} volume={vol * MASTER} /></Sequence>;
};
export const Vox: React.FC<{ who: string; at: number; vol?: number; len?: number }> = ({ who, at, vol = 1, len = 3.2 }) => {
  const s = voxMarks[who]; if (s == null) return null; const from = Math.round(s * FPS), to = Math.round((s + len) * FPS);
  return <Sequence from={at} durationInFrames={to - from} layout="none"><Audio src={staticFile('audio/voice_all.wav')} startFrom={from} endAt={to} volume={vol * MASTER} /></Sequence>;
};
// музыкальная тема движка с плавным входом/выходом
// голос диктора (Gemini TTS): играет, только если реплика есть в src/vo.json
import VOM from './vo.json';
export const VO = VOM as Record<string, number>;
export const Narr: React.FC<{ id: string; at: number; vol?: number }> = ({ id, at, vol = 1 }) => VO[id] ? <Sequence from={at} durationInFrames={Math.ceil(VO[id] * FPS) + 2} layout="none"><Audio src={staticFile('audio/vo_' + id + '.wav')} volume={vol * MASTER * 1.25} /></Sequence> : null;
// приглушение музыки под голос: множитель громкости по абсолютному кадру
let duckCues: [number, number][] = [];
export const setDuck = (c: [number, number][]) => { duckCues = c; };
const duckAt = (fr: number) => { let k = 1; for (const [a, b] of duckCues) k = Math.min(k, interpolate(fr, [a - 8, a, b, b + 12], [1, .38, .38, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })); return k; };
export const Music: React.FC<{ theme: string; at: number; len: number; vol?: number; fin?: number; fout?: number; offset?: number }> = ({ theme, at, len, vol = .8, fin = 20, fout = 20, offset = 2 }) => (
  <Sequence from={at} durationInFrames={len} layout="none">
    <Audio src={staticFile(`audio/mus_${theme}.wav`)} startFrom={Math.round(offset * FPS)} volume={(f) => vol * MASTER * duckAt(at + f) * Math.min(fin ? interpolate(f, [0, fin], [0, 1], { extrapolateRight: 'clamp' }) : 1, fout ? interpolate(f, [len - fout, len], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1)} />
  </Sequence>
);
