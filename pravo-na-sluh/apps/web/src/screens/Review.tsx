// Сессия повторения: очередь карточек (к повторению / ошибки / по статье), ответ, разбор, итог.

import type { AnswerResultDto, CardDto } from '@pravo/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { QuestionCard, type AnswerPayload } from '../components/QuestionCard.tsx';
import { Empty, ErrorState, Progress, Skeleton, TopBar, useToast } from '../components/ui.tsx';
import { track } from '../lib/analytics.ts';
import { ApiError, get, post } from '../lib/api.ts';
import { plural } from '../lib/format.ts';
import { haptic } from '../lib/telegram.ts';

type Result = AnswerResultDto & { intervalDays?: number };

export function ReviewScreen() {
  const [params] = useSearchParams();
  const mode = params.get('mode') ?? 'due';
  const key = params.get('key') ?? '';
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const queue = useQuery({
    queryKey: ['queue', mode, key],
    queryFn: () => get<{ cards: CardDto[]; lockedCount: number; hint: string | null }>(`/api/memory/queue?mode=${mode}${key ? `&key=${encodeURIComponent(key)}` : ''}&limit=20`),
    staleTime: Infinity,
    gcTime: 0,
  });
  const [i, setI] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState({ ok: 0, total: 0 });

  const title = mode === 'mistakes' ? 'Только ошибки' : mode === 'article' ? 'Проверка по статье' : 'Повторение';
  if (queue.isLoading) return <Screen><TopBar title={title} back /><Skeleton h={260} /></Screen>;
  if (queue.isError) {
    const pro = queue.error instanceof ApiError && queue.error.code === 'pro_required';
    return (
      <Screen>
        <TopBar title={title} back />
        {pro ? <Empty icon="lock" title="Доступно в Pro" action={<button className="btn accent" onClick={() => nav('/pro')}>Посмотреть тарифы</button>}>Режим повторения ошибок входит в подписку Pro.</Empty>
          : <ErrorState error={queue.error} onRetry={() => queue.refetch()} />}
      </Screen>
    );
  }
  const cards = queue.data!.cards;
  if (!cards.length) {
    return (
      <Screen>
        <TopBar title={title} back />
        <Empty icon={queue.data!.lockedCount ? 'lock' : 'check'} title={queue.data!.lockedCount ? 'Вопросы этой статьи — в Pro' : 'Сейчас нечего повторять'}
          action={queue.data!.lockedCount ? <button className="btn accent" onClick={() => nav('/pro')}>Открыть Pro</button> : <button className="btn primary" onClick={() => nav('/constitution')}>Слушать Конституцию</button>}>
          {queue.data!.hint ?? 'Новые вопросы появляются по мере прослушивания статей, а повторения — по расписанию.'}
        </Empty>
      </Screen>
    );
  }

  const done = i >= cards.length;
  if (done) {
    return (
      <Screen>
        <TopBar title={title} back />
        <section className="card center" style={{ padding: 28 }}>
          <div className="doc-cover" style={{ margin: '0 auto 10px', width: 64, height: 64, alignItems: 'center', padding: 0, color: 'var(--success)' }}><Icon name="check" size={32} /></div>
          <h2 style={{ margin: '6px 0' }}>Сессия завершена</h2>
          <p className="muted">Верных ответов: {score.ok} из {score.total}</p>
          <p className="hint">Карточки вернутся по расписанию интервальных повторений.</p>
          <div className="stack-s" style={{ marginTop: 14 }}>
            <button className="btn primary block" onClick={() => { setI(0); setScore({ ok: 0, total: 0 }); setResult(null); void queue.refetch(); }}>Ещё карточки</button>
            <button className="btn block" onClick={() => nav('/memory')}>К разделу «Запоминание»</button>
          </div>
        </section>
      </Screen>
    );
  }

  const card = cards[i];
  const answer = async (a: AnswerPayload, confidence?: 1 | 2 | 3) => {
    setBusy(true);
    try {
      const r = await post<Result>(`/api/memory/cards/${card.id}/answer`, { answer: a, confidence: confidence ?? null });
      setResult(r);
      setScore((s) => ({ ok: s.ok + (r.correct ? 1 : 0), total: s.total + 1 }));
      if (card.type !== 'recall') (r.correct ? haptic.success : haptic.error)();
      track('review_answer', { type: card.type, correct: r.correct });
      void qc.invalidateQueries({ queryKey: ['memory-overview'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не удалось сохранить ответ', 'error');
      if (e instanceof ApiError && e.code === 'pro_required') nav('/pro');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title={title} back right={<span className="hint">{i + 1} / {cards.length}</span>} />
      <Progress value={(i / cards.length) * 100} />
      <div style={{ height: 14 }} />
      <QuestionCard key={card.id} card={card} result={result} onAnswer={answer} busy={busy} showIntervals />
      {result ? (
        <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => { setResult(null); setI(i + 1); }}>
          {i + 1 < cards.length ? 'Следующий вопрос' : 'Завершить'} <Icon name="right" size={18} />
        </button>
      ) : null}
      <p className="hint center" style={{ marginTop: 12 }}>{cards.length - i - 1 > 0 ? `Осталось ${cards.length - i - 1} ${plural(cards.length - i - 1, 'карточка', 'карточки', 'карточек')}` : 'Последняя карточка'}</p>
    </Screen>
  );
}
