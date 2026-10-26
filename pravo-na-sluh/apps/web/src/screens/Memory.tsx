// Раздел «Запоминание»: что повторить сегодня, тесты по главам, сложные темы, история.

import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { ErrorState, Sheet, Skeleton, TopBar } from '../components/ui.tsx';
import { dateShort, plural } from '../lib/format.ts';
import { useMe, useMemoryOverview } from '../lib/hooks.ts';
import { useState } from 'react';

export function MemoryScreen() {
  const q = useMemoryOverview();
  const me = useMe();
  const nav = useNavigate();
  const [how, setHow] = useState(false);
  const pro = me.data?.entitlement.pro ?? false;

  if (q.isLoading) return <Screen><TopBar title="Запоминание" /><Skeleton h={150} /><div style={{ height: 12 }} /><Skeleton h={64} n={4} /></Screen>;
  if (q.isError || !q.data) return <Screen><TopBar title="Запоминание" /><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const d = q.data;
  const ready = d.dueNow + d.newAvailable;

  return (
    <Screen>
      <TopBar title="Запоминание" right={<button className="icon-btn" aria-label="Как это работает" onClick={() => setHow(true)}><Icon name="help" /></button>} />

      <section className="hero card">
        <div className="eyebrow">Повторение на сегодня</div>
        <h2>{d.dueNow ? `${d.dueNow} ${plural(d.dueNow, 'карточка', 'карточки', 'карточек')} к повторению` : d.newAvailable ? `${d.newAvailable} новых ${plural(d.newAvailable, 'вопрос', 'вопроса', 'вопросов')}` : 'Всё повторено'}</h2>
        <p>{ready ? 'Вопросы по прослушанным статьям — по расписанию интервальных повторений.' : 'Слушайте статьи Конституции — по ним появятся вопросы. Можно начать с главы 1.'}</p>
        <button className="btn on-hero block" style={{ marginTop: 14 }} onClick={() => nav('/memory/review?mode=due')}>
          <Icon name="brain" size={18} /> {ready ? 'Начать повторение' : 'Попробовать вопросы главы 1'}
        </button>
        {d.reviewedToday ? <p className="small" style={{ marginTop: 8, fontSize: 12 }}>Сегодня ответов: {d.reviewedToday}</p> : null}
      </section>

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div className="stat"><div className="v">{d.totalCards}</div><div className="l">доступно карточек</div></div>
        <button className="stat" style={{ textAlign: 'left' }} onClick={() => (pro ? nav('/memory/review?mode=mistakes') : nav('/pro'))}>
          <div className="v">{pro ? <Icon name="repeat" size={20} /> : <Icon name="lock" size={20} />}</div>
          <div className="l">Режим «Только ошибки»{pro ? '' : ' · Pro'}</div>
        </button>
      </div>

      <h2 className="section">Тесты по главам</h2>
      <div className="list">
        {d.chapters.map((c) => (
          <button key={c.chapterKey} className="list-item" onClick={() => nav(c.locked ? '/pro' : `/memory/quiz/chapter/${c.chapterKey}`)}>
            <div className="ring" style={{ ['--p' as string]: c.accuracy ?? 0 }} data-label={c.accuracy != null ? `${c.accuracy}%` : '—'} />
            <div className="grow">
              <div className="title">{c.title}</div>
              <div className="sub">{c.cards} {plural(c.cards, 'вопрос', 'вопроса', 'вопросов')} · изучено {c.seen}{c.accuracy != null ? ` · точность ${c.accuracy}%` : ''}</div>
            </div>
            {c.locked ? <span className="badge pro"><Icon name="lock" size={12} /> Pro</span> : <Icon name="right" className="chev" />}
          </button>
        ))}
      </div>

      <h2 className="section">Сложные статьи</h2>
      {d.difficult.length ? (
        <div className="list">
          {d.difficult.map((x) => (
            <button key={x.articleKey} className="list-item" onClick={() => nav(`/memory/review?mode=article&key=${x.articleKey}`)}>
              <Icon name="alert" />
              <div className="grow"><div className="title">{x.title}</div><div className="sub">Точность {x.accuracy}% · ошибок {x.errors}</div></div>
              <span className="btn small">Повторить</span>
            </button>
          ))}
        </div>
      ) : <p className="hint">Здесь появятся статьи, в которых вы ошибаетесь чаще всего. Пока данных недостаточно.</p>}

      <h2 className="section">История тестов</h2>
      {d.history.length ? (
        <div className="list">
          {d.history.map((h) => (
            <div key={h.id} className="list-item">
              <div className="grow"><div className="title">{h.title}</div><div className="sub">{dateShort(h.finishedAt)}</div></div>
              <b>{h.correct}/{h.total}</b>
            </div>
          ))}
        </div>
      ) : <p className="hint">Пройдите тест по главе или статье — результат появится здесь.</p>}

      {d.lockedCards && !pro ? (
        <button className="card tap" style={{ marginTop: 16 }} onClick={() => nav('/pro')}>
          <div className="row"><Icon name="crown" /><div className="grow"><div className="doc-title">Ещё {d.lockedCards} карточек в Pro</div><div className="doc-meta">Главы 3–9, раздел второй, экзамены по главам, расширенная статистика</div></div><Icon name="right" /></div>
        </button>
      ) : null}

      <Sheet open={how} onClose={() => setHow(false)} title="Как работает запоминание">
        <div className="md">
          <p><b>Активное вспоминание.</b> Сначала пытаетесь вспомнить ответ сами, затем сверяетесь с текстом статьи. Так материал закрепляется сильнее, чем при повторном чтении.</p>
          <p><b>Интервальные повторения.</b> Карточка возвращается через интервал, который зависит от ваших ответов: ошибка — через 10 минут, уверенный ответ — через дни и недели. Алгоритм — модификация SM-2, учитывает сложность вопроса и опоздание с повторением.</p>
          <p><b>Проверяемые ответы.</b> К каждому вопросу приложена дословная цитата из статьи и ссылка на часть/пункт.</p>
          <p><b>Честная статистика.</b> Мы показываем точность ваших ответов, а не обещаем «запоминание на 100%» — такого гарантировать нельзя.</p>
        </div>
        <button className="btn primary block" onClick={() => setHow(false)}>Понятно</button>
      </Sheet>
    </Screen>
  );
}
