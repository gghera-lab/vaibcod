import React from 'react';
import { Composition, Still } from 'remotion';
import { Trailer } from './Trailer';
import { KeyArt, Poster } from './KeyArt';

// размеры графики Steam (страница магазина и библиотека) + афиша
const CAPS: [string, number, number, 'wide' | 'tall' | 'hero' | 'logo' | 'bg', string?][] = [
  ['Header-920x430', 920, 430, 'wide'],
  ['Header-460x215', 460, 215, 'wide'],
  ['Small-462x174', 462, 174, 'wide'],
  ['Main-1232x706', 1232, 706, 'wide', 'сатирическая стратегия о власти'],
  ['Main-616x353', 616, 353, 'wide'],
  ['Vertical-748x896', 748, 896, 'tall'],
  ['Library-600x900', 600, 900, 'tall'],
  ['LibraryHero-3840x1240', 3840, 1240, 'hero'],
  ['LibraryLogo-1280x720', 1280, 720, 'logo'],
  ['PageBg-1438x810', 1438, 810, 'bg'],
];

export const Root: React.FC = () => (
  <>
    <Composition id="Trailer" component={Trailer} durationInFrames={2250} fps={30} width={1920} height={1080} />
    {CAPS.map(([id, w, h, mode, tag]) => <Still key={id} id={id} component={KeyArt} width={w} height={h} defaultProps={{ mode, tag, age: false }} />)}
    <Still id="Poster-A4-2480x3508" component={Poster} width={2480} height={3508} />
    <Still id="Story-1080x1920" component={Poster} width={1080} height={1920} />
  </>
);
