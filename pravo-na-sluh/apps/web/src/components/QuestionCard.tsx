// Карточка вопроса: выбор ответа, верно/неверно, пропущенное слово, «вспомни статью» + разбор с цитатой.

import type { AnswerResultDto, CardDto } from '@pravo/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { interval } from '../lib/format.ts';
import { useArticle } from '../lib/hooks.ts';
import { LawText } from '../screens/Article.tsx';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { Icon } from './Icon.tsx';
import { Spinner } from './ui.tsx';

export type AnswerPayload = { index: number } | { value: boolean } | { text: string } | { grade: number };

const KIND: Record<CardDto['type'], string> = {
  single: 'Выберите ответ',
  truefalse: 'Верно или неверно?',
  cloze: 'Вставьте пропущенное слово',
  recall: 'Вспомните статью',
};

export function QuestionCard({ card, result, onAnswer, busy, showIntervals }: {
  card: CardDto;
  result: (AnswerResultDto & { intervalDays?: number }) | null;
  onAnswer: (a: AnswerPayload, confidence?: 1 | 2 | 3) => void;
  busy: boolean;
  showIntervals?: boolean;
}) {
  const [chosen, setChosen] = useState<number | boolean | null>(null);
  const [text, setText] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [confidence, setConfidence] = useState<1 | 2 | 3>(2);
  const player = usePlayer();
  const nav = useNavigate();
  const answered = !!result;

  const listen = () => {
    player.playKey(card.articleKey);
    nav('/player');
  };

  return (
    <div className="qcard">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="kind">{KIND[card.type]}</span>
        <span className="hint">{card.sourceRef}</span>
      </div>
      <div className={`q ${card.type === 'cloze' ? 'law' : ''}`}>{card.prompt}</div>

      {card.type === 'single' && card.options ? (
        <div>
          {card.options.map((o, i) => {
            const isCorrect = answered && normalize(o) === normalize(result!.correctAnswer);
            const isWrong = answered && chosen === i && !isCorrect;
            return (
              <button key={i} className={`answer ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''} ${!answered && chosen === i ? 'chosen' : ''}`}
                disabled={answered || busy} onClick={() => { setChosen(i); onAnswer({ index: i }, confidence); }}>
                {o}
              </button>
            );
          })}
        </div>
      ) : null}

      {card.type === 'truefalse' ? (
        <div className="row" style={{ gap: 8 }}>
          {[true, false].map((v) => {
            const correct = answered && (result!.correctAnswer === 'Верно') === v;
            const wrong = answered && chosen === v && !correct;
            return (
              <button key={String(v)} className={`answer grow center ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}`} style={{ marginTop: 0 }}
                disabled={answered || busy} onClick={() => { setChosen(v); onAnswer({ value: v }, confidence); }}>
                {v ? 'Верно' : 'Неверно'}
              </button>
            );
          })}
        </div>
      ) : null}

      {card.type === 'cloze' ? (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer({ text: text.trim() }, confidence); }} className="row" style={{ gap: 8 }}>
          <input className="input grow" value={text} onChange={(e) => setText(e.target.value)} disabled={answered || busy} placeholder="Слово из текста статьи" aria-label="Ответ" autoCapitalize="off" autoComplete="off" />
          <button className="btn primary" type="submit" disabled={answered || busy || !text.trim()}>{busy ? <Spinner /> : 'Ответить'}</button>
        </form>
      ) : null}

      {card.type === 'recall' && !answered ? (
        revealed ? (
          <div>
            <p className="hint">Оцените, насколько точно вы вспомнили содержание статьи:</p>
            <div className="grade-row">
              {[{ g: 1, t: 'Не вспомнил' }, { g: 2, t: 'Частично' }, { g: 3, t: 'В основном' }, { g: 4, t: 'Точно' }].map((x) => (
                <button key={x.g} className={`grade g${x.g}`} disabled={busy} onClick={() => onAnswer({ grade: x.g })}>
                  {x.t}{showIntervals && card.intervals ? <small>{interval(card.intervals[x.g as 1 | 2 | 3 | 4])}</small> : null}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button className="btn primary block" onClick={() => setRevealed(true)}><Icon name="text" size={18} /> Показать текст статьи</button>
        )
      ) : null}

      {card.type === 'recall' && revealed && !answered ? <RecallText articleKey={card.articleKey} /> : null}

      {!answered && card.type !== 'recall' ? (
        <div style={{ marginTop: 14 }}>
          <p className="hint" style={{ margin: '0 0 6px' }}>Насколько вы уверены? (влияет на интервал повторения)</p>
          <div className="segmented">
            {([1, 2, 3] as const).map((c) => <button key={c} className={confidence === c ? 'on' : ''} onClick={() => setConfidence(c)}>{c === 1 ? 'Сомневаюсь' : c === 2 ? 'Скорее да' : 'Уверен'}</button>)}
          </div>
        </div>
      ) : null}

      {answered ? (
        <div className={`verdict ${result!.correct ? 'ok' : 'bad'}`}>
          <div className="head">{card.type === 'recall' ? 'Оценка сохранена' : result!.correct ? 'Верно' : `Неверно. Правильный ответ: ${result!.correctAnswer}`}</div>
          <div className="quote">«{result!.quote}»</div>
          <div className="small muted">{result!.explanation}</div>
          <div className="hint" style={{ marginTop: 6 }}>Источник: {result!.sourceRef} ({result!.editionLabel})</div>
          {result!.intervalDays != null ? <div className="hint">Следующее повторение — через {interval(result!.intervalDays)}</div> : null}
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn small ghost" onClick={listen}><Icon name="headphones" size={16} /> Прослушать статью</button>
            <button className="btn small ghost" onClick={() => nav(`/constitution/${card.articleKey}`)}><Icon name="text" size={16} /> Текст</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Эталон для самооценки — текст статьи. */
function RecallText({ articleKey }: { articleKey: string }) {
  const q = useArticle(articleKey);
  if (!q.data) return <div className="skeleton" style={{ height: 120, marginTop: 12 }} />;
  return <div className="card flat" style={{ marginTop: 12 }}><LawText units={q.data.units} activeUnit={null} /></div>;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}
