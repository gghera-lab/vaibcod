// Тест по главе или статье: вопросы → ответы с разбором → результат с ошибками и ссылками на статьи.

import type { AnswerResultDto, CardDto } from '@pravo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { QuestionCard, type AnswerPayload } from '../components/QuestionCard.tsx';
import { Empty, ErrorState, Progress, Skeleton, TopBar, useToast } from '../components/ui.tsx';
import { track } from '../lib/analytics.ts';
import { ApiError, post } from '../lib/api.ts';
import { haptic } from '../lib/telegram.ts';

interface Finish { title: string; total: number; answered: number; correct: number; pct: number; mistakes: { cardId: string; prompt: string; sourceRef: string; quote: string; articleKey: string }[] }

export function QuizScreen() {
  const { scope = 'chapter', key = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [quiz, setQuiz] = useState<{ attemptId: number; title: string; cards: CardDto[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [i, setI] = useState(0);
  const [result, setResult] = useState<AnswerResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [finish, setFinish] = useState<Finish | null>(null);
  const started = useRef(false);

  const start = async () => {
    setError(null); setQuiz(null); setFinish(null); setI(0); setResult(null);
    try {
      const q = await post<{ attemptId: number; title: string; cards: CardDto[] }>('/api/quiz', { scope, key });
      setQuiz(q);
      track('quiz_start', { scope, key });
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    const pro = error instanceof ApiError && error.code === 'pro_required';
    return (
      <Screen>
        <TopBar title="Тест" back />
        {pro ? <Empty icon="lock" title="Тест этой главы — в Pro" action={<button className="btn accent" onClick={() => nav('/pro')}>Посмотреть тарифы</button>}>Бесплатно доступны тесты по преамбуле и главам 1–2.</Empty>
          : <ErrorState error={error} onRetry={start} />}
      </Screen>
    );
  }
  if (!quiz) return <Screen><TopBar title="Тест" back /><Skeleton h={260} /></Screen>;

  if (finish) {
    return (
      <Screen>
        <TopBar title="Результат" back />
        <section className="hero card center">
          <div className="eyebrow">{finish.title}</div>
          <h2 style={{ fontSize: 40, margin: '8px 0' }}>{finish.pct}%</h2>
          <p>Верно {finish.correct} из {finish.total}</p>
        </section>
        {finish.mistakes.length ? (
          <>
            <h2 className="section">Разбор ошибок</h2>
            <div className="stack">
              {finish.mistakes.map((m) => (
                <div key={m.cardId} className="card">
                  <div className="doc-title">{m.prompt}</div>
                  <div className="quote">«{m.quote}»</div>
                  <div className="row"><span className="hint grow">{m.sourceRef}</span><button className="btn small ghost" onClick={() => nav(`/constitution/${m.articleKey}`)}>Открыть статью</button></div>
                </div>
              ))}
            </div>
          </>
        ) : <p className="muted center">Без ошибок — отличный результат.</p>}
        <div className="stack-s" style={{ marginTop: 16 }}>
          <button className="btn primary block" onClick={start}><Icon name="repeat" size={18} /> Пройти ещё раз</button>
          <button className="btn block" onClick={() => nav('/memory')}>К разделу «Запоминание»</button>
        </div>
      </Screen>
    );
  }

  const card = quiz.cards[i];
  const answer = async (a: AnswerPayload) => {
    setBusy(true);
    try {
      const r = await post<AnswerResultDto>(`/api/quiz/${quiz.attemptId}/answer`, { cardId: card.id, answer: a });
      setResult(r);
      (r.correct ? haptic.success : haptic.error)();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не удалось отправить ответ', 'error');
    } finally {
      setBusy(false);
    }
  };
  const next = async () => {
    setResult(null);
    if (i + 1 < quiz.cards.length) { setI(i + 1); return; }
    setBusy(true);
    try {
      const f = await post<Finish>(`/api/quiz/${quiz.attemptId}/finish`);
      setFinish(f);
      track('quiz_finish', { scope, key, pct: f.pct });
      void qc.invalidateQueries({ queryKey: ['memory-overview'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не удалось завершить тест', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title={quiz.title} back right={<span className="hint">{i + 1} / {quiz.cards.length}</span>} />
      <Progress value={(i / quiz.cards.length) * 100} />
      <div style={{ height: 14 }} />
      <QuestionCard key={card.id} card={card} result={result} onAnswer={answer} busy={busy} />
      {result ? <button className="btn primary block" style={{ marginTop: 14 }} disabled={busy} onClick={next}>{i + 1 < quiz.cards.length ? 'Следующий вопрос' : 'Показать результат'}</button> : null}
    </Screen>
  );
}
