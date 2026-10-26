// «Кабинет · три срока» — трейлер 75 с (2250 кадров, 30 к/с). Сценарий: ../Сценарий_трейлера.md
import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, Easing, Img, staticFile } from 'remotion';
import { C, SERIF, SANS, CAP, useFonts, Seq, Pic, Cam, Fade, Flash, Title, Quote, Stamp, Rough, Shake, Grain, Bars, Glitch, Sfx, Vox, Music, Narr, VO, setDuck } from './lib';

// кадр-«карточка» интерфейса с лёгким наездом
const Shot: React.FC<{ dur: number; children: React.ReactNode; z?: [number, number]; x?: [number, number]; y?: [number, number]; origin?: string; flash?: boolean }> = ({ dur, children, z = [1.02, 1.1], x, y, origin, flash = true }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Cam dur={dur} z={z} x={x} y={y} origin={origin}>{children}</Cam>
    {flash && <Flash len={7} peak={.55} />}
  </AbsoluteFill>
);
// тёмная подложка под нижний титр
const Shade: React.FC<{ from?: number }> = ({ from = .45 }) => <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent ${from * 100}%, rgba(8,6,12,.88) 100%)` }} />;

// ---------- 1 · хук ----------
const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const txt = 'Поздравляем.'; const n = Math.floor(interpolate(f, [8, 34], [0, txt.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Shake at={[62]} amp={22}>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, #2a2033 0%, ${C.ink} 70%)`, opacity: interpolate(f, [56, 64], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }} />
        <div style={{ position: 'absolute', top: 300, width: '100%', textAlign: 'center', fontFamily: SERIF, fontSize: 64, color: C.cream, opacity: interpolate(f, [100, 118], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>{txt.slice(0, n)}</div>
        <Sequence from={62}><Stamp text="ИЗБРАН" sub="ПРЕЗИДЕНТ МУРЛАНДИИ" y={560} size={170} rot={-7} /></Sequence>
        <Sequence from={62}><Flash len={10} color="#ffe2c0" peak={.5} /></Sequence>
      </Shake>
    </AbsoluteFill>
  );
};

// ---------- 2 · дворец ----------
const Palace: React.FC<{ dur: number }> = ({ dur }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Cam dur={dur} z={[1.0, 1.14]} y={[30, -20]} origin="50% 40%"><Pic src="art/bg_sel_pres.png" pixel /></Cam>
    <Fade dur={dur} inn={24}><AbsoluteFill /></Fade>
    <AbsoluteFill style={{ background: '#000', opacity: interpolate(useCurrentFrame(), [0, 26], [1, 0], { extrapolateRight: 'clamp' }) }} />
    <Shade from={.4} />
    <Sequence from={20} durationInFrames={80}><Title text="Мурландия." sub="страна котов" dur={80} y={760} size={84} /></Sequence>
    <Sequence from={100} durationInFrames={dur - 100}><Title text="Законы — настоящие." dur={dur - 100} y={770} size={72} italic /></Sequence>
  </AbsoluteFill>
);

// ---------- 3 · выборы ----------
const Elect: React.FC<{ dur: number }> = ({ dur }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sequence durationInFrames={110}><Shot dur={110} z={[1.05, 1.16]} origin="70% 40%"><Seq name="v_ballot" from={.6} speed={1.35} /></Shot><Shade /><Title text="Сначала — выборы." dur={110} y={850} size={66} /></Sequence>
    <Sequence from={110} durationInFrames={dur - 110}><Shot dur={dur - 110} z={[1.18, 1.3]} origin="25% 35%"><Pic src="shots/s_cik.png" /></Shot><Quote text="Явка — 99%, но это энтузиазм" who="Глава избиркома" dur={dur - 110} y={790} size={50} /></Sequence>
  </AbsoluteFill>
);

// ---------- 4 · присяга ----------
const Oath: React.FC<{ dur: number }> = ({ dur }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Shot dur={dur} z={[1.25, 1.4]} origin="35% 78%"><Seq name="v_oath" from={.4} speed={1.45} /></Shot>
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, transparent 50%, rgba(8,6,12,.75) 80%)' }} />
    <Sequence from={10} durationInFrames={dur - 10}><Title text={'Присяга.\nПодпись.\nПечать.'} dur={dur - 10} y={330} size={84} align="left" x={1260} /></Sequence>
  </AbsoluteFill>
);

// ---------- 5 · механики ----------
const MECH: { d: number; el: React.ReactNode }[] = [
  { d: 62, el: <><Shot dur={62} z={[1, 1.06]}><Seq name="v_stage_tariffs" pixel /></Shot><Shade /><Title text="Решайте." dur={62} y={840} size={80} /></> },
  { d: 62, el: <><Shot dur={62} z={[1.1, 1.22]} origin="50% 55%"><Seq name="v_decree" from={.3} speed={1.6} /></Shot><Shade /><Title text="Подписывайте указы." dur={62} y={840} size={72} /></> },
  { d: 62, el: <><Shot dur={62} z={[1.12, 1.24]} origin="50% 50%"><Seq name="v_phone" from={.2} speed={1.5} /></Shot><Shade /><Title text="Звоните кому надо." dur={62} y={840} size={72} /></> },
  { d: 62, el: <><Shot dur={62} z={[1.02, 1.1]}><Seq name="v_duma" from={.5} speed={1.4} /></Shot><Shade /><Title text="Проводите законы через Думу…" dur={62} y={840} size={66} /></> },
  { d: 60, el: <><Shot dur={60} z={[1.02, 1.1]}><Seq name="v_sf" from={.5} speed={1.4} /></Shot><Shade /><Title text="…и Совет Федерации." dur={60} y={840} size={66} /></> },
  { d: 66, el: <><Shot dur={66} z={[1.05, 1.12]}><Seq name="v_stage_snow" pixel /></Shot><Quote text="Зима, как обычно, наступила неожиданно" who="Мэр столицы" dur={66} y={800} size={46} /></> },
  { d: 66, el: <><Shot dur={66} z={[1.05, 1.12]}><Seq name="v_stage_crypto" pixel /></Shot><Quote text="Мурлыкоин! Курс будет только расти" who="Министр цифры" dur={66} y={800} size={46} /></> },
];
const Mech: React.FC = () => { let t = 0; return <AbsoluteFill style={{ background: '#000' }}>{MECH.map((m, i) => { const s = t; t += m.d; return <Sequence key={i} from={s} durationInFrames={m.d}>{m.el}</Sequence>; })}</AbsoluteFill>; };
export const MECH_LEN = MECH.reduce((a, m) => a + m.d, 0);

// ---------- 6 · тревога ----------
const TENS: { d: number; el: React.ReactNode }[] = [
  { d: 66, el: <><Shot dur={66} z={[1.15, 1.32]} origin="78% 30%"><Seq name="v_card_env1" speed={1} /></Shot><Shade /><Title text="Секретные пакеты." dur={66} y={850} size={70} /></> },
  { d: 78, el: <><Shot dur={78} z={[1.15, 1.35]} origin="50% 45%"><Seq name="v_stage_surveil" pixel /></Shot><AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(0,0,0,.6) 80%)' }} /><Quote text="Против террористов, разумеется" who="Полковник Тень" dur={78} y={800} size={50} /></> },
  { d: 56, el: <><Shot dur={56} z={[1.1, 1.25]} origin="70% 25%"><Seq name="v_card_leak" /></Shot><Shade /><Title text="Газеты всё помнят." dur={56} y={850} size={66} /></> },
  { d: 56, el: <><Shot dur={56} z={[1.05, 1.15]}><Seq name="v_stage_protest" pixel /></Shot><Shade /><Title text="Улица — тоже." dur={56} y={850} size={66} /></> },
  { d: 54, el: <><Shot dur={54} z={[1.15, 1.3]} origin="50% 50%"><Pic src="shots/s_threat.png" /></Shot><Shade /><Title text="Каждое решение кто-то запомнит." dur={54} y={850} size={60} /></> },
];
const Tens: React.FC = () => { let t = 0; return <AbsoluteFill style={{ background: '#000' }}>{TENS.map((m, i) => { const s = t; t += m.d; return <Sequence key={i} from={s} durationInFrames={m.d}>{m.el}</Sequence>; })}</AbsoluteFill>; };
export const TENS_LEN = TENS.reduce((a, m) => a + m.d, 0);

// ---------- 7 · три срока ----------
const Roman: React.FC<{ n: string; label: string; dur: number }> = ({ n, label, dur }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Shake at={[0]} amp={14}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 340, lineHeight: 1, color: C.gold, textShadow: '0 0 60px rgba(226,180,90,.35)', transform: `scale(${interpolate(f, [0, 6, dur], [1.5, 1, .94], { extrapolateRight: 'clamp' })})` }}>{n}</div>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 40, letterSpacing: '.4em', textTransform: 'uppercase', color: C.cream, marginTop: 10, opacity: interpolate(f, [4, 12], [0, 1], { extrapolateRight: 'clamp' }) }}>{label}</div>
        </AbsoluteFill>
      </Shake>
      <Flash len={6} peak={.6} color="#ffe9b0" />
    </AbsoluteFill>
  );
};
const Terms: React.FC<{ dur: number }> = ({ dur }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Sequence durationInFrames={34}><Roman n="I" label="первый срок" dur={34} /></Sequence>
    <Sequence from={34} durationInFrames={34}><Roman n="II" label="второй" dur={34} /></Sequence>
    <Sequence from={68} durationInFrames={92}><Shot dur={92} z={[1.1, 1.24]} origin="75% 25%"><Seq name="v_card_terms" /></Shot><Shade from={.35} /><Quote text="Ваши прежние сроки не считаются" who="Когтев, руководитель администрации" dur={92} y={790} size={50} /></Sequence>
    <Sequence from={160} durationInFrames={44}><Roman n="III" label="обнуление" dur={44} /></Sequence>
    <Sequence from={204} durationInFrames={dur - 204}><BunkerHint dur={dur - 204} /></Sequence>
  </AbsoluteFill>
);
const BunkerHint: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const vis = interpolate(f, [0, 6, 26, 32, 40, 44, dur - 12, dur], [0, 1, 1, .15, .9, 1, 1, 0], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ opacity: vis * .85 }}><Glitch><Cam dur={dur} z={[1.25, 1.05]} origin="50% 30%"><Seq name="v_stage_p8_t4screens" pixel /></Cam></Glitch></AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 40%, transparent 20%, rgba(0,0,0,.85) 75%)' }} />
      <Sequence from={30} durationInFrames={dur - 30}><Title text="Сорок метров бетона." dur={dur - 30} y={820} size={70} italic /></Sequence>
    </AbsoluteFill>
  );
};

// ---------- 8 · нарастающая нарезка ----------
const RUSH = ['v_stage_tariffs', 'v_card_watch', 'v_stage_pension', 'v_duma', 'v_card_env1', 'v_stage_surveil', 'v_decree', 'v_stage_protest', 'v_card_leak', 'v_sf', 'v_stage_rating', 'v_card_t3'];
const Rush: React.FC<{ dur: number }> = ({ dur }) => {
  const lens = [14, 13, 12, 11, 10, 9, 8, 8, 7, 6, 6, 6]; let t = 0;
  const end = lens.reduce((a, b) => a + b, 0);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {RUSH.map((n, i) => { const s = t; t += lens[i]; return <Sequence key={i} from={s} durationInFrames={lens[i]}><Shot dur={lens[i]} z={[1.08, 1.18]} flash={i % 2 === 0}><Seq name={n} from={1.5} pixel={n.includes('stage')} /></Shot></Sequence>; })}
      <Sequence from={end} durationInFrames={dur - end}><AbsoluteFill style={{ background: '#000' }}><Title text="Сколько вы продержитесь?" dur={dur - end} y={480} size={76} /></AbsoluteFill></Sequence>
    </AbsoluteFill>
  );
};

// ---------- 9 · плашка ----------
export const Logo: React.FC<{ scale?: number; glow?: boolean }> = ({ scale = 1, glow = true }) => (
  <div style={{ textAlign: 'center', transform: `scale(${scale})` }}>
    <div style={{ fontFamily: CAP, fontWeight: 700, fontSize: 230, lineHeight: .95, letterSpacing: '.02em', background: 'linear-gradient(180deg, #fff3c4 0%, #f2cd78 45%, #c48a2e 100%)', WebkitBackgroundClip: 'text', color: 'transparent', WebkitTextStroke: '0px', filter: `drop-shadow(0 8px 0 #000) drop-shadow(0 0 ${glow ? 50 : 0}px rgba(226,180,90,.45))`, paddingBottom: 10 }}>КАБИНЕТ</div>
    <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 64, color: C.cream, marginTop: 4, letterSpacing: '.04em', textShadow: '0 3px 0 #000' }}>три срока</div>
  </div>
);
const EndCard: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const a = interpolate(f, [0, 30], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const b = interpolate(f, [40, 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <AbsoluteFill style={{ opacity: .38 * a }}><Cam dur={dur} z={[1.12, 1.0]}><Pic src="art/bg_rev_office.png" pixel /></Cam></AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 42%, rgba(13,10,18,.35) 0%, ${C.ink} 78%)` }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', opacity: a, transform: `translateY(${(1 - a) * 30 - 60}px)` }}>
        <Logo />
        <div style={{ marginTop: 56, opacity: b, display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 34, letterSpacing: '.18em', textTransform: 'uppercase', color: C.ink, background: `linear-gradient(180deg, #f6d68a, ${C.gold})`, padding: '18px 40px', borderRadius: 6, boxShadow: '0 6px 0 #6d4c1c' }}>Добавьте в желаемое в Steam</div>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 30, color: '#ff6a5a', border: '3px solid #ff6a5a', borderRadius: 6, padding: '12px 14px' }}>18+</div>
        </div>
        <div style={{ marginTop: 40, opacity: b * .8, fontFamily: SANS, fontSize: 24, color: '#b9ad95', letterSpacing: '.06em' }}>Сатира. Страна и персонажи вымышлены.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- общий монтаж ----------
export const T = (() => {
  const hook = 120, palace = 190, elect = 200, oath = 190, mech = MECH_LEN, tens = TENS_LEN, terms = 290, rush = 160;
  const s = { hook: 0, palace: hook, elect: hook + palace, oath: 0, mech: 0, tens: 0, terms: 0, rush: 0, end: 0, total: 2250 };
  s.oath = s.elect + elect; s.mech = s.oath + oath; s.tens = s.mech + mech; s.terms = s.tens + tens; s.rush = s.terms + terms; s.end = s.rush + rush;
  return { ...s, len: { hook, palace, elect, oath, mech, tens, terms, rush, end: 2250 - s.end } };
})();

export const Trailer: React.FC = () => {
  useFonts();
  const f = useCurrentFrame();
  const barH = interpolate(f, [0, T.mech - 10, T.mech + 10], [130, 130, 0], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Rough />
      <Sequence durationInFrames={T.len.hook}><Hook /></Sequence>
      <Sequence from={T.palace} durationInFrames={T.len.palace}><Palace dur={T.len.palace} /></Sequence>
      <Sequence from={T.elect} durationInFrames={T.len.elect}><Elect dur={T.len.elect} /></Sequence>
      <Sequence from={T.oath} durationInFrames={T.len.oath}><Oath dur={T.len.oath} /></Sequence>
      <Sequence from={T.mech} durationInFrames={T.len.mech}><Mech /></Sequence>
      <Sequence from={T.tens} durationInFrames={T.len.tens}><Tens /></Sequence>
      <Sequence from={T.terms} durationInFrames={T.len.terms}><Terms dur={T.len.terms} /></Sequence>
      <Sequence from={T.rush} durationInFrames={T.len.rush}><Rush dur={T.len.rush} /></Sequence>
      <Sequence from={T.end} durationInFrames={T.len.end}><EndCard dur={T.len.end} /></Sequence>
      {f < T.end && <Bars h={barH} />}
      <Grain />
      <TrailerAudio />
    </AbsoluteFill>
  );
};

// ---------- звуковая дорожка ----------
const TrailerAudio: React.FC = () => {
  let t = T.mech; const mechAt = MECH.map((m) => { const s = t; t += m.d; return s; });
  t = T.tens; const tensAt = TENS.map((m) => { const s = t; t += m.d; return s; });
  const rushLens = [14, 13, 12, 11, 10, 9, 8, 8, 7, 6, 6, 6]; t = T.rush; const rushAt = rushLens.map((d) => { const s = t; t += d; return s; });
  const rushEnd = t;
  // реплики диктора: [id, кадр начала]
  const NARR: [string, number][] = [['hook', 6], ['land', T.palace + 4], ['oath', T.oath + 14], ['remember', tensAt[4] - 6], ['terms', T.terms + 2], ['hold', rushEnd + 2], ['title', T.end + 44]];
  setDuck(NARR.filter(([id]) => VO[id]).map(([id, a]) => [a, a + Math.ceil(VO[id] * 30)]));
  return (
    <>
      {NARR.map(([id, a]) => <Narr key={id} id={id} at={a} />)}
      {/* хук: часы, удар штампа */}
      <Sfx name="clock.chime" at={4} vol={.5} />
      <Sfx name="ui.typing" at={8} vol={.6} />
      <Sfx name="paper.stampBig" at={60} vol={1} />
      <Sfx name="big" at={61} vol={.7} />
      {/* музыка */}
      <Music theme="menu" at={T.palace - 10} len={T.oath - T.palace + 30} vol={.75} fin={30} />
      <Sfx name="ballotIn" at={T.elect + 55} vol={.9} />
      <Sfx name="elect.win" at={T.elect + 110} vol={.7} />
      <Vox who="cik" at={T.elect + 116} vol={.9} />
      <Music theme="oath" at={T.oath - 10} len={T.len.oath + 20} vol={.8} />
      <Sfx name="paper.sign" at={T.oath + 4} vol={.9} />
      <Sfx name="paper.stamp" at={T.oath + 112} vol={1} />
      <Sfx name="oath.bells" at={T.oath + 140} vol={.6} />
      <Music theme="vote" at={T.mech - 6} len={T.len.mech + 12} vol={.7} fin={10} />
      {mechAt.map((s, i) => <Sfx key={i} name="paper.page" at={s} vol={.5} />)}
      <Vox who="pm" at={mechAt[0] + 6} vol={.9} />
      <Sfx name="paper.stamp" at={mechAt[1] + 34} vol={.9} />
      <Sfx name="phone.key" at={mechAt[2] + 6} vol={.8} /><Sfx name="phone.key" at={mechAt[2] + 14} vol={.8} /><Sfx name="phone.key" at={mechAt[2] + 22} vol={.8} /><Sfx name="phone.ringback" at={mechAt[2] + 32} vol={.7} />
      <Sfx name="vote.tick" at={mechAt[3] + 8} vol={.7} /><Sfx name="gavel" at={mechAt[3] + 44} vol={.9} />
      <Sfx name="vote.pass" at={mechAt[4] + 30} vol={.8} />
      <Vox who="mayor" at={mechAt[5] + 4} vol={.95} />
      <Vox who="it" at={mechAt[6] + 4} vol={.95} />
      <Music theme="tense" at={T.tens - 8} len={T.len.tens + 16} vol={.8} fin={8} />
      <Sfx name="waxCrack" at={tensAt[0] + 18} vol={1} />
      <Vox who="ten" at={tensAt[1] + 6} vol={1} />
      <Sfx name="paper.news" at={tensAt[2]} vol={.8} />
      <Sfx name="boo" at={tensAt[3]} vol={.6} />
      <Sfx name="thr.up" at={tensAt[4] + 4} vol={.9} />
      {/* три срока */}
      <Music theme="crisis" at={T.terms - 4} len={T.len.terms + T.len.rush - 30} vol={.85} fin={6} fout={10} />
      <Sfx name="paper.stampBig" at={T.terms} vol={1} />
      <Sfx name="paper.stampBig" at={T.terms + 34} vol={1} />
      <Vox who="kogtev" at={T.terms + 74} vol={1} />
      <Sfx name="paper.stampBig" at={T.terms + 160} vol={1} /><Sfx name="big" at={T.terms + 161} vol={.8} />
      <Sfx name="door.heavy" at={T.terms + 206} vol={1} />
      <Sfx name="vhs" at={T.terms + 210} vol={.6} />
      {/* нарезка */}
      {rushAt.map((s, i) => <Sfx key={i} name={i % 3 === 2 ? 'paper.stamp' : 'ui.click'} at={s} vol={.6 + i * .03} />)}
      <Sfx name="alarm.crisis" at={T.rush + 40} vol={.55} />
      <Sfx name="phone.ring" at={rushEnd + 14} vol={.9} len={2.2} />
      {/* плашка */}
      <Music theme="termEnd" at={T.end} len={T.len.end} vol={.8} fin={15} fout={40} />
      <Sfx name="oath.bells" at={T.end + 2} vol={.5} />
      <Sfx name="cat.meow" at={2250 - 46} vol={.9} />
    </>
  );
};
