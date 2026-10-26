// Экран документа каталога (кроме Конституции): реквизиты, статус, источник, «Слушать» → «в разработке».

import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { CONSTITUTION_ID, coverLabel, useDocActions, useListen } from '../components/DocCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { ErrorState, Skeleton, TopBar } from '../components/ui.tsx';
import { track } from '../lib/analytics.ts';
import { dateRu } from '../lib/format.ts';
import { useDocument } from '../lib/hooks.ts';
import { pushRecent } from '../lib/storage.ts';
import { openExternal } from '../lib/telegram.ts';

export function DocumentScreen() {
  const { id = '' } = useParams();
  const q = useDocument(id);
  const actions = useDocActions();
  const { listen, sheet } = useListen();
  useEffect(() => {
    if (id && id !== CONSTITUTION_ID) {
      pushRecent(id);
      track('document_open', { doc: id });
    }
  }, [id]);
  if (id === CONSTITUTION_ID) return <Navigate to="/constitution" replace />;
  if (q.isLoading) return <Screen><TopBar title="Документ" back /><Skeleton h={160} /><div style={{ height: 12 }} /><Skeleton h={60} n={3} /></Screen>;
  if (q.isError || !q.data) return <Screen><TopBar title="Документ" back /><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const d = q.data;

  return (
    <Screen>
      <TopBar title={d.shortTitle} back right={
        <button className={`icon-btn ${d.isFavorite ? 'on' : ''}`} aria-label={d.isFavorite ? 'Убрать из избранного' : 'В избранное'} onClick={() => actions.favorite(d)}>
          <Icon name="star" fill={d.isFavorite} />
        </button>
      } />

      <section className="card">
        <div className="doc-card">
          <div className="doc-cover" style={{ width: 56, height: 72 }}>{coverLabel(d)}</div>
          <div className="grow">
            <div className="doc-title" style={{ fontSize: 17 }}>{d.title}</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              <span className="badge soon"><Icon name="clock" size={13} /> Аудиоверсия в разработке</span>
              {d.status === 'in_force' ? <span className="badge ok">Действует</span> : <span className="badge test">Статус не подтверждён</span>}
            </div>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>{d.description}</p>
      </section>

      <div className="stack-s" style={{ marginTop: 14 }}>
        <button className="btn primary block" onClick={() => listen(d)}><Icon name="headphones" size={18} /> Слушать</button>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn grow" disabled={!d.officialUrl} onClick={() => d.officialUrl && openExternal(d.officialUrl)}><Icon name="doc" size={18} /> Открыть документ</button>
          <button className={`btn grow ${d.notify ? 'ghost' : ''}`} onClick={() => actions.notify(d)}><Icon name="bell" size={18} /> {d.notify ? 'Слежу' : 'Следить за аудио'}</button>
        </div>
        <button className={`btn block ${d.voted ? 'ghost' : ''}`} onClick={() => actions.vote(d)}>
          <Icon name="vote" size={18} /> {d.voted ? `Голос отдан (${d.votes}) · снять` : `Голосовать за озвучку${d.votes ? ` · ${d.votes}` : ''}`}
        </button>
      </div>

      <h2 className="section">Реквизиты</h2>
      <div className="list">
        <Row label="Вид документа" value={d.docType} />
        {d.number ? <Row label="Номер" value={`№ ${d.number}`} /> : null}
        {d.adoptedAt ? <Row label="Дата принятия" value={dateRu(d.adoptedAt)} /> : null}
        <Row label="Статус" value={d.statusNote ?? '—'} />
        {d.publication ? <Row label="Официальное опубликование" value={d.publication} /> : null}
      </div>

      <h2 className="section">Источник и актуальность</h2>
      <div className="source-box stack-s">
        <div><b>Источник:</b> {d.sourceName ?? 'не указан'}</div>
        <div><b>Проверено:</b> {d.verifiedAt ? dateRu(d.verifiedAt) : 'реквизиты не проверены по официальному источнику'}</div>
        {d.verificationNote ? <div>{d.verificationNote}</div> : null}
        <div>Текст документа в бета-версии не загружен в приложение: для работы с актуальной редакцией используйте официальный источник.</div>
        {d.officialUrl ? <button className="btn small ghost" style={{ justifySelf: 'start' }} onClick={() => openExternal(d.officialUrl!)}><Icon name="external" size={16} /> pravo.gov.ru</button> : null}
      </div>
      {sheet}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="list-item" style={{ display: 'block' }}>
      <div className="sub">{label}</div>
      <div style={{ fontSize: 15 }}>{value}</div>
    </div>
  );
}
