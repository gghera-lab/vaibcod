import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Screen } from '../components/Layout.tsx';
import { ErrorState, Skeleton, TopBar } from '../components/ui.tsx';
import { get } from '../lib/api.ts';
import { Markdown } from '../lib/markdown.tsx';

export function LegalScreen() {
  const { doc = 'terms' } = useParams();
  const q = useQuery({ queryKey: ['legal', doc], queryFn: () => get<{ title: string; markdown: string }>(`/api/legal/${doc}`) });
  return (
    <Screen>
      <TopBar title={q.data?.title ?? 'Документ'} back />
      {q.isLoading ? <Skeleton h={300} /> : q.isError || !q.data ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Markdown source={q.data.markdown} />}
    </Screen>
  );
}
