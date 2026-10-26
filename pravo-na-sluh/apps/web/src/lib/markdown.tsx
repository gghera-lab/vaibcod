// Мини-рендер Markdown для юридических документов приложения (заголовки, абзацы, списки, жирный, ссылки).
// HTML из текста не исполняется — всё выводится через React как текст.

import type { ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${key}-b${i++}`}>{tok.slice(2, -2)}</strong>);
    else {
      const [, label, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      const safe = /^(https?:|\/|mailto:)/.test(href) ? href : '#';
      out.push(<a key={`${key}-a${i++}`} href={safe} target={safe.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{label}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r/g, '').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let table: string[][] | null = null;
  const flushTable = () => {
    if (!table) return;
    const [head, ...body] = table;
    blocks.push(
      <table key={`t${blocks.length}`}>
        <thead><tr>{head.map((c, i) => <th key={i}>{inline(c, `th${blocks.length}-${i}`)}</th>)}</tr></thead>
        <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, i) => <td key={i}>{inline(c, `td${blocks.length}-${ri}-${i}`)}</td>)}</tr>)}</tbody>
      </table>,
    );
    table = null;
  };
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={`l${blocks.length}`}>{items}</ol> : <ul key={`l${blocks.length}`}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); flushList();
      const Tag = (`h${h[1].length}`) as 'h1' | 'h2' | 'h3';
      blocks.push(<Tag key={`h${blocks.length}`}>{inline(h[2], `h${blocks.length}`)}</Tag>);
    } else if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((ul ?? ol)![1]);
    } else if (!line.trim()) {
      flushPara(); flushList();
    } else if (/^>\s?/.test(line)) {
      flushPara(); flushList();
      blocks.push(<div key={`q${blocks.length}`} className="source-box">{inline(line.replace(/^>\s?/, ''), `q${blocks.length}`)}</div>);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara(); flushList(); flushTable();
  return <div className="md">{blocks}</div>;
}
