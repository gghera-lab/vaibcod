// Главная: продолжить Конституцию, повторение на сегодня, статистика, документы.

import type { DocumentDto } from '@pravo/shared';
import { useNavigate } from 'react-router-dom';
import { CONSTITUTION_ID, DocCard, useDocActions, useListen } from '../components/DocCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { Progress, Skeleton } from '../components/ui.tsx';
import { duration, greeting, plural } from '../lib/format.ts';
import { useCatalog, useMe, useMemoryOverview, useStats, useToc, useUpcoming } from '../lib/hooks.ts';
import { load } from '../lib/storage.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';

export function HomeScreen() {
  const me = useMe();
  const nav = useNavigate();
  const player = usePlayer();
  const toc = useToc();
  const stats = useStats();
  const memory = useMemoryOverview();
  const catalog = useCatalog({});
  const upcoming = useUpcoming();
  const { listen, sheet } = useListen();

  const chapters = toc.data?.chapters ?? [];
  const chapter = player.track ? chapters.find((c) => c.key === player.track!.chapterKey) : null;
  const done = stats.data?.articlesCompleted ?? 0;
  const total = stats.data?.articlesTotal ?? 152;
  const playing = player.status === 'playing' || player.status === 'loading';
  const recentIds = load<string[]>('recent-docs', []);
  const all = catalog.data?.items ?? [];
  const recent = recentIds.map((id) => all.find((d) => d.id === id)).filter(Boolean) as DocumentDto[];
  const popular = all.filter((d) => d.category === 'codes').slice(0, 6);

  return (
    <Screen>
      <header className="row" style={{ marginBottom: 16 }}>
        <div className="grow">
          <div className="hint">Право на слух</div>
          <h1 style={{ margin: 0, fontSize: 24, letterSpacing: '-0.02em' }}>{greeting(me.data?.user.firstName ?? null)}</h1>
        </div>
        <span className="badge beta">Бета</span>
      </header>

      <section className="hero card">
        <div className="eyebrow">{player.track ? 'Продолжить' : 'Аудиокнига'} · Конституция РФ</div>
        <h2>{player.track ? player.track.title : 'Конституция Российской Федерации'}</h2>
        <p>{chapter ? (chapter.number ? `Глава ${chapter.number}. ${chapter.title}` : chapter.title) : 'Главы, статьи и текст перед глазами. Место остановки сохраняется.'}</p>
        <div style={{ margin: '14px 0 6px' }}><Progress value={(done / total) * 100} /></div>
        <p className="small" style={{ fontSize: 12 }}>Прослушано {done} из {total} {plural(total, 'статьи', 'статей', 'статей')}</p>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn on-hero grow" onClick={() => { if (player.track) player.toggle(); else player.playKey('intro'); }}
            disabled={player.status === 'unavailable'}>
            <Icon name={playing ? 'pause' : 'play'} fill size={18} /> {playing ? 'Пауза' : player.track ? 'Продолжить слушать' : 'Начать слушать'}
          </button>
          <button className="btn" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }} onClick={() => nav('/constitution')} aria-label="Оглавление">
            <Icon name="list" />
          </button>
        </div>
        {player.status === 'unavailable' ? <p className="small" style={{ marginTop: 10 }}>Аудио временно недоступно — текст можно читать.</p> : null}
      </section>

      <h2 className="section">Запоминание</h2>
      <button className="card tap" onClick={() => nav((memory.data?.dueNow ?? 0) + (memory.data?.newAvailable ?? 0) > 0 ? '/memory/review?mode=due' : '/memory')}>
        <div className="row">
          <div className="doc-cover" style={{ width: 48, height: 48, alignItems: 'center', padding: 0, color: 'var(--accent)' }}><Icon name="brain" /></div>
          <div className="grow">
            {memory.isLoading ? <div className="skeleton" style={{ height: 36 }} /> : (
              <>
                <div className="doc-title">
                  {memory.data?.dueNow
                    ? `${memory.data.dueNow} ${plural(memory.data.dueNow, 'карточка ждёт', 'карточки ждут', 'карточек ждут')} повторения`
                    : memory.data?.newAvailable ? `Новых вопросов: ${memory.data.newAvailable}` : 'Ежедневное повторение'}
                </div>
                <div className="doc-meta">{memory.data?.reviewedToday ? `Сегодня ответов: ${memory.data.reviewedToday}` : 'Пара минут в день закрепляет прослушанное'}</div>
              </>
            )}
          </div>
          <Icon name="right" className="chev" />
        </div>
      </button>

      <h2 className="section">Ваша статистика</h2>
      {stats.isLoading ? <Skeleton h={70} n={1} /> : (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat"><div className="v">{duration(stats.data?.listenedMs ?? 0)}</div><div className="l">прослушано</div></div>
          <div className="stat"><div className="v">{done}</div><div className="l">{plural(done, 'статья', 'статьи', 'статей')} изучено</div></div>
          <div className="stat"><div className="v"><Icon name="flame" size={18} /> {stats.data?.streakDays ?? 0}</div><div className="l">дней подряд</div></div>
        </div>
      )}

      {recent.length ? (
        <>
          <h2 className="section">Последние документы</h2>
          <div className="stack">{recent.slice(0, 3).map((d) => <DocCard key={d.id} doc={d} onListen={() => listen(d)} />)}</div>
        </>
      ) : null}

      <h2 className="section">Популярные кодексы <button className="link" onClick={() => nav('/library?category=codes')}>Все</button></h2>
      {catalog.isLoading ? <Skeleton h={88} n={2} /> : <div className="stack">{popular.slice(0, 4).map((d) => <DocCard key={d.id} doc={d} onListen={() => listen(d)} />)}</div>}

      <h2 className="section">Скоро в аудиоформате</h2>
      <UpcomingList docs={(upcoming.data ?? []).filter((d) => d.id !== CONSTITUTION_ID)} />
      {sheet}
    </Screen>
  );
}

function UpcomingList({ docs }: { docs: DocumentDto[] }) {
  const actions = useDocActions();
  const nav = useNavigate();
  return (
    <div className="list">
      <div className="list-item" style={{ display: 'block' }}>
        <div className="sub">Голосуйте за документы — самые востребованные озвучим первыми. У каждого пользователя 3 голоса.</div>
      </div>
      {docs.slice(0, 5).map((d) => (
        <div key={d.id} className="list-item">
          <button className="grow" style={{ border: 0, background: 'none', textAlign: 'left', padding: 0 }} onClick={() => nav(`/doc/${d.id}`)}>
            <div className="title">{d.shortTitle}</div>
            <div className="sub">{d.votes ? `${d.votes} ${plural(d.votes, 'голос', 'голоса', 'голосов')}` : 'Пока без голосов'}</div>
          </button>
          <button className={`btn small ${d.voted ? 'ghost' : 'primary'}`} onClick={() => void actions.vote(d)}>
            <Icon name="vote" size={16} /> {d.voted ? 'Голос учтён' : 'Голосовать'}
          </button>
        </div>
      ))}
    </div>
  );
}
