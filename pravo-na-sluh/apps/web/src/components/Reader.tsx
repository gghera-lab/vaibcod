// «Страница документа» в плеере: заголовок статьи, пометки о редакции, нумерованные части.
// Текущий фрагмент подсвечивается, страница сама прокручивается за диктором; если пользователь
// листает вручную, автопрокрутка ждёт несколько секунд и предлагает вернуться к читаемому месту.

import type { TextUnit } from '@pravo/shared';
import { useEffect, useRef, useState } from 'react';
import { unitLabel } from '../screens/Article.tsx';
import { Icon } from './Icon.tsx';

export interface ReaderLine {
  text: string;
  kind: 'title' | 'heading' | 'note';
}

const USER_SCROLL_PAUSE_MS = 6000;

export function Reader({ title, subtitle, notes = [], units, lines, activeUnit, activeLine, onOpen }: {
  title: string;
  subtitle?: string | null;
  notes?: string[];
  units?: TextUnit[];
  /** Для вступления и названий глав (нет частей статьи). */
  lines?: ReaderLine[];
  activeUnit: string | null;
  activeLine?: number;
  onOpen?: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const programmatic = useRef(0);
  const userScrolledAt = useRef(0);
  const [away, setAway] = useState(false);
  const activeKey = activeUnit ?? (activeLine != null && activeLine >= 0 ? `line-${activeLine}` : null);

  const scrollToActive = (force = false) => {
    const el = activeKey ? refs.current[activeKey] : null;
    const c = box.current;
    if (!el || !c) return;
    if (!force && Date.now() - userScrolledAt.current < USER_SCROLL_PAUSE_MS) return;
    programmatic.current = Date.now();
    c.scrollTo({ top: Math.max(0, el.offsetTop - c.clientHeight * 0.22), behavior: 'smooth' });
    setAway(false);
  };

  useEffect(() => { scrollToActive(); }, [activeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Новая статья — страница в начало.
  useEffect(() => {
    userScrolledAt.current = 0;
    programmatic.current = Date.now();
    box.current?.scrollTo({ top: 0 });
  }, [title]);

  const onScroll = () => {
    if (Date.now() - programmatic.current < 1500) return;
    userScrolledAt.current = Date.now();
    // Кнопка «К читаемому месту» — только если читаемый фрагмент действительно ушёл из окна.
    const el = activeKey ? refs.current[activeKey] : null;
    const c = box.current;
    if (!el || !c) return;
    const visible = el.offsetTop + el.offsetHeight > c.scrollTop + 20 && el.offsetTop < c.scrollTop + c.clientHeight - 20;
    setAway(!visible);
  };

  let passed = true;
  return (
    <div className="reader-wrap">
      <div className="reader" ref={box} onScroll={onScroll} aria-live="off">
        <div className="r-top">
          <div className="grow">
            <h2 className="r-head">{title}</h2>
            {subtitle ? <div className="r-sub">{subtitle}</div> : null}
          </div>
          {onOpen ? <button className="btn small ghost" onClick={onOpen} aria-label="Открыть статью целиком"><Icon name="text" size={16} /></button> : null}
        </div>
        {notes.map((n, i) => <div key={i} className="r-ed">({n})</div>)}

        {units?.map((u) => {
          const isActive = u.id === activeUnit;
          if (isActive) passed = false;
          const state = isActive ? 'active' : activeUnit && passed ? 'past' : '';
          return (
            <div key={u.id} ref={(el) => { refs.current[u.id] = el; }} className={`r-unit ${u.type === 'item' ? 'item' : ''} ${state}`}>
              {unitLabel(u) ? <span className="lbl">{unitLabel(u)} </span> : null}
              {u.text}
              {u.notes.map((n, i) => <div key={i} className="r-note">({n})</div>)}
            </div>
          );
        })}

        {lines?.map((l, i) => (
          <div key={i} ref={(el) => { refs.current[`line-${i}`] = el; }}
            className={`r-line ${l.kind} ${activeLine === i ? 'active' : activeLine != null && i < activeLine ? 'past' : ''}`}>
            {l.text}
          </div>
        ))}
      </div>
      {away ? (
        <button className="r-back btn small primary" onClick={() => { userScrolledAt.current = 0; scrollToActive(true); }}>
          <Icon name="headphones" size={15} /> К читаемому месту
        </button>
      ) : null}
    </div>
  );
}
