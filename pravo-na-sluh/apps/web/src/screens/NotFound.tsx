import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Layout.tsx';
import { Empty } from '../components/ui.tsx';

export function NotFound() {
  const nav = useNavigate();
  return (
    <Screen>
      <Empty icon="search" title="Страница не найдена" action={<button className="btn primary" onClick={() => nav('/')}>На главную</button>}>
        Возможно, ссылка устарела.
      </Empty>
    </Screen>
  );
}
