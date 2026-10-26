// Метрики продукта (только для администраторов — доступ проверяется на сервере).

import { useQuery } from '@tanstack/react-query';
import { Screen } from '../components/Layout.tsx';
import { ErrorState, Skeleton, TopBar } from '../components/ui.tsx';
import { get } from '../lib/api.ts';

type Metrics = Record<string, unknown> & {
  note: string;
  users: { total: number; real: number; new7d: number };
  activation: { activatedUsers: number; rate: number | null; definition: string };
  retention: { d1: number | null; d7: number | null; returnedToLearning: number | null; definition: string };
  learning: { articlesCompletedAvg: number | null; quizCompletionRate: number | null };
  monetization: { payingUsers: number; conversion: number | null; revenueStars: number };
  playback: { listenStarts: number; errors: number; errorRate: number | null };
  funnel30d: { name: string; users: number; events: number }[];
  demand: { topVotes: { id: string; title: string; n: number }[]; topAudioRequests: { id: string; n: number }[] };
};

const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

export function AdminScreen() {
  const q = useQuery({ queryKey: ['admin-metrics'], queryFn: () => get<Metrics>('/api/admin/metrics') });
  if (q.isLoading) return <Screen><TopBar title="Метрики" back /><Skeleton h={80} n={4} /></Screen>;
  if (q.isError || !q.data) return <Screen><TopBar title="Метрики" back /><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const m = q.data;
  return (
    <Screen>
      <TopBar title="Метрики продукта" back />
      <p className="hint">{m.note}</p>
      <div className="stat-grid">
        <div className="stat"><div className="v">{m.users.real}</div><div className="l">пользователей (+{m.users.new7d} за 7 дней)</div></div>
        <div className="stat"><div className="v">{pct(m.activation.rate)}</div><div className="l">активация: {m.activation.definition}</div></div>
        <div className="stat"><div className="v">{pct(m.retention.d1)} / {pct(m.retention.d7)}</div><div className="l">удержание D1 / D7</div></div>
        <div className="stat"><div className="v">{pct(m.retention.returnedToLearning)}</div><div className="l">вернулись к обучению (≥2 дня с ответами)</div></div>
        <div className="stat"><div className="v">{m.learning.articlesCompletedAvg ?? '—'}</div><div className="l">изучено статей на пользователя</div></div>
        <div className="stat"><div className="v">{pct(m.learning.quizCompletionRate)}</div><div className="l">завершённых тестов</div></div>
        <div className="stat"><div className="v">{pct(m.monetization.conversion)}</div><div className="l">конверсия в оплату · {m.monetization.revenueStars} ⭐</div></div>
        <div className="stat"><div className="v">{pct(m.playback.errorRate)}</div><div className="l">ошибок воспроизведения</div></div>
      </div>
      <h2 className="section">Воронка (30 дней, уникальные пользователи)</h2>
      <div className="list">{m.funnel30d.map((f) => <div key={f.name} className="list-item"><span className="grow">{f.name}</span><b>{f.users}</b><span className="hint">{f.events} соб.</span></div>)}</div>
      <h2 className="section">Спрос на озвучку</h2>
      <div className="list">{m.demand.topVotes.length ? m.demand.topVotes.map((v) => <div key={v.id} className="list-item"><span className="grow">{v.title}</span><b>{v.n}</b></div>) : <div className="list-item hint">Голосов пока нет</div>}</div>
    </Screen>
  );
}
