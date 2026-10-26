// ключевой арт: афиша и капсулы Steam из одного макета. Всё — настоящий пиксель-арт игры (фоны ×10, спрайты ×20).
import React from 'react';
import { AbsoluteFill, Img, staticFile, useVideoConfig } from 'remotion';
import { C, SERIF, SANS, CAP, useFonts } from './lib';

type Mode = 'wide' | 'tall' | 'hero' | 'logo' | 'bg';
const px: React.CSSProperties = { imageRendering: 'pixelated', position: 'absolute' };

const LogoBlock: React.FC<{ s: number; sub?: boolean; tag?: string }> = ({ s, sub = true, tag }) => (
  <div style={{ textAlign: 'center', lineHeight: 1 }}>
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* обводка как в игре: чёрный контур + тень */}
      <div style={{ fontFamily: CAP, fontWeight: 700, fontSize: 200 * s, letterSpacing: '.02em', color: '#000', WebkitTextStroke: `${16 * s}px #000`, position: 'absolute', left: 0, top: 9 * s, whiteSpace: 'nowrap' }}>КАБИНЕТ</div>
      <div style={{ fontFamily: CAP, fontWeight: 700, fontSize: 200 * s, letterSpacing: '.02em', color: '#000', WebkitTextStroke: `${16 * s}px #000`, position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap' }}>КАБИНЕТ</div>
      <div style={{ fontFamily: CAP, fontWeight: 700, fontSize: 200 * s, letterSpacing: '.02em', position: 'relative', whiteSpace: 'nowrap', background: 'linear-gradient(180deg, #fff6d2 0%, #f6d27e 48%, #cf9234 52%, #b97a24 100%)', WebkitBackgroundClip: 'text', color: 'transparent', filter: `drop-shadow(0 0 ${30 * s}px rgba(240,190,90,.35))` }}>КАБИНЕТ</div>
    </div>
    {sub && <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontWeight: 700, fontSize: 64 * s, color: C.cream, marginTop: 6 * s, letterSpacing: '.05em', textShadow: `0 ${4 * s}px 0 #000, 0 0 ${12 * s}px #000` }}>три срока</div>}
    {tag && <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 30 * s, letterSpacing: '.22em', textTransform: 'uppercase', color: C.gold, marginTop: 18 * s, textShadow: '0 2px 8px #000' }}>{tag}</div>}
  </div>
);

const Stamp: React.FC<{ s: number; text: string; rot: number; style?: React.CSSProperties }> = ({ s, text, rot, style }) => (
  <div style={{ position: 'absolute', transform: `rotate(${rot}deg)`, border: `${7 * s}px solid ${C.red}`, borderRadius: 14 * s, padding: `${6 * s}px ${24 * s}px`, color: C.red, fontFamily: SANS, fontWeight: 700, fontSize: 64 * s, letterSpacing: '.1em', opacity: .9, filter: 'url(#rough2)', ...style }}>{text}</div>
);

export const KeyArt: React.FC<{ mode: Mode; tag?: string; age?: boolean }> = ({ mode, tag, age = true }) => {
  useFonts();
  const { width: W, height: H } = useVideoConfig();
  const tall = mode === 'tall';
  // масштаб макета относительно эталона 1920×1080 (широкий) или 1080×1920 (высокий)
  const s = tall ? W / 1080 : Math.min(W / 1920, H / 1080 * 1.0);
  const bgW = tall ? H * .62 * 16 / 9 : Math.max(H * 16 / 9, W * 1.22);
  const bgH = bgW * 9 / 16;
  // кот-президент и тень за плечом
  const catH = tall ? H * .4 : mode === 'hero' ? H * .74 : H * .7;
  const catW = catH * 34 / 33;
  const catX = tall ? (W - catW) / 2 - W * .08 : mode === 'hero' ? W * .5 : W - catW - W * .05;
  const catY = tall ? H * .5 : H - catH * .97;
  const tenH = catH * 1.12, tenW = tenH * 34 / 33;
  const tenX = catX + catW * .5, tenY = catY - catH * .2;
  return (
    <AbsoluteFill style={{ background: mode === 'logo' ? 'transparent' : C.ink, overflow: 'hidden' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}><filter id="rough2"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="5" /><feDisplacementMap in="SourceGraphic" scale="4" /></filter></svg>
      {mode !== 'logo' && <>
        {/* ночной дворец Мурландии */}
        <Img src={staticFile('art/bg_sel_pres.png')} style={{ ...px, width: bgW, height: bgH, left: (W - bgW) / 2 + (tall ? 0 : -W * .1), top: tall ? H - bgH : (H - bgH) * .3 }} />
        <AbsoluteFill style={{ background: tall ? `linear-gradient(180deg, ${C.ink} 0%, ${C.ink} 34%, rgba(13,10,18,.55) 50%, rgba(13,10,18,.15) 75%, rgba(13,10,18,.6) 100%)` : `linear-gradient(90deg, rgba(13,10,18,.92) 0%, rgba(13,10,18,.55) 38%, rgba(13,10,18,.25) 60%, rgba(13,10,18,.55) 100%)` }} />
        {/* прожектор */}
        <AbsoluteFill style={{ background: `radial-gradient(ellipse ${tall ? '70% 40%' : '40% 70%'} at ${tall ? '54% 66%' : '68% 60%'}, rgba(255,214,140,.28) 0%, transparent 70%)`, mixBlendMode: 'screen' }} />
        {mode !== 'bg' && <>
          {/* Полковник Тень — силуэт за плечом */}
          {mode !== 'wide' && <Img src={staticFile('art/ten_shadow.png')} style={{ ...px, imageRendering: 'auto', width: tenW * 800 / 680, height: tenH * 780 / 660, left: tenX - tenW * 60 / 680, top: tenY - tenH * 60 / 660 }} />}
          <Img src={staticFile('art/cat_player.png')} style={{ ...px, width: catW, height: catH, left: catX, top: catY, filter: `drop-shadow(0 0 ${40 * s}px rgba(0,0,0,.8))` }} />
        </>}
        {/* зерно и виньетка */}
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,.55) 100%)' }} />
      </>}
      {mode === 'wide' && <>
        <div style={{ position: 'absolute', left: W * .03, top: H * .5, transform: 'translateY(-55%)', width: W * .56 }}><LogoBlock s={Math.min(W * .54 / 1000, H * .3 / 200)} tag={tag} /></div>
        {age && <div style={{ position: 'absolute', right: 24 * s, top: 20 * s, fontFamily: SANS, fontWeight: 700, fontSize: 30 * s, color: '#ff6a5a', border: `${3 * s}px solid #ff6a5a`, borderRadius: 6 * s, padding: `${4 * s}px ${8 * s}px`, background: 'rgba(0,0,0,.5)' }}>18+</div>}
      </>}
      {mode === 'tall' && <>
        <div style={{ position: 'absolute', left: 0, right: 0, top: H * .05 }}><LogoBlock s={W * .86 / 1000} tag={tag} /></div>
        <Stamp s={s} text="ОБНУЛЕНО" rot={-9} style={{ left: W * .06, top: H * .43 }} />
        {age && <div style={{ position: 'absolute', right: 24 * s, bottom: 22 * s, fontFamily: SANS, fontWeight: 700, fontSize: 30 * s, color: '#ff6a5a', border: `${3 * s}px solid #ff6a5a`, borderRadius: 6 * s, padding: `${4 * s}px ${8 * s}px`, background: 'rgba(0,0,0,.5)' }}>18+</div>}
      </>}
      {mode === 'logo' && <AbsoluteFill style={{ background: 'transparent', alignItems: 'center', justifyContent: 'center' }}><LogoBlock s={W / 1280 * 1.15} /></AbsoluteFill>}
    </AbsoluteFill>
  );
};

// афиша (печать/соцсети): высокий макет + слоган и строка «Steam»
export const Poster: React.FC = () => {
  useFonts();
  const { width: W, height: H } = useVideoConfig(); const s = W / 1080;
  return (
    <AbsoluteFill>
      <KeyArt mode="tall" age={false} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: H * .265, textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 46 * s, color: C.cream, textShadow: '0 3px 10px #000', lineHeight: 1.3 }}>Вас избрали.<br />Теперь попробуйте остаться.</div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: H * .045, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', fontFamily: SANS, fontWeight: 700, fontSize: 30 * s, letterSpacing: '.2em', textTransform: 'uppercase', color: C.ink, background: `linear-gradient(180deg, #f6d68a, ${C.gold})`, padding: `${14 * s}px ${30 * s}px`, borderRadius: 6 * s, boxShadow: `0 ${5 * s}px 0 #6d4c1c` }}>Добавьте в желаемое · Steam</div>
        <div style={{ marginTop: 18 * s, fontFamily: SANS, fontSize: 20 * s, color: '#b9ad95' }}>Сатира · страна и персонажи вымышлены · 18+</div>
      </div>
    </AbsoluteFill>
  );
};
