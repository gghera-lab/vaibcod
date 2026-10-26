// Карточка документа каталога и лист «Озвучка в разработке».

import type { DocumentDto } from '@pravo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { track } from '../lib/analytics.ts';
import { ApiError, put } from '../lib/api.ts';
import { dateShort } from '../lib/format.ts';
import { haptic, openExternal } from '../lib/telegram.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { Icon } from './Icon.tsx';
import { Sheet, Spinner, useToast } from './ui.tsx';

export const CONSTITUTION_ID = 'constitution-rf';

export function coverLabel(d: DocumentDto): string {
  if (d.id === CONSTITUTION_ID) return 'КРФ';
  const m = /^([А-ЯЁA-Z]{2,5})\s+РФ/.exec(d.shortTitle);
  if (m) return m[1];
  if (d.number) return d.number.replace(/\s.*$/, '').slice(0, 7);
  return d.docType.split(' ')[0].slice(0, 6);
}

export function docMeta(d: DocumentDto): string {
  const parts = [d.docType];
  if (d.number) parts.push(`№ ${d.number}`);
  if (d.adoptedAt) parts.push(`от ${dateShort(d.adoptedAt)}`);
  return parts.join(' · ');
}

/** Действия с документом: избранное, уведомление о выходе аудио, голос за озвучку. */
export function useDocActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = (d: DocumentDto) => {
    qc.setQueryData(['doc', d.id], d);
    void qc.invalidateQueries({ queryKey: ['catalog'] });
    void qc.invalidateQueries({ queryKey: ['favorites'] });
    void qc.invalidateQueries({ queryKey: ['upcoming'] });
  };
  const run = async (path: string, on: boolean, ok: string) => {
    try {
      const d = await put<DocumentDto>(path, { on });
      haptic.success();
      refresh(d);
      toast(ok);
      return d;
    } catch (e) {
      haptic.error();
      toast(e instanceof ApiError ? e.message : 'Не удалось выполнить действие', 'error');
      return null;
    }
  };
  return {
    favorite: (d: DocumentDto) => {
      track(d.isFavorite ? 'favorite_remove' : 'favorite_add', { doc: d.id });
      return run(`/api/documents/${d.id}/favorite`, !d.isFavorite, d.isFavorite ? 'Удалено из избранного' : 'Добавлено в избранное');
    },
    notify: (d: DocumentDto) => {
      if (!d.notify) track('audio_notify_request', { doc: d.id });
      return run(`/api/documents/${d.id}/notify`, !d.notify, d.notify ? 'Уведомление отключено' : 'Сообщим в Telegram, когда выйдет озвучка');
    },
    vote: (d: DocumentDto) => {
      if (!d.voted) track('vote_cast', { doc: d.id });
      return run(`/api/documents/${d.id}/vote`, !d.voted, d.voted ? 'Голос снят' : 'Голос учтён — спасибо!');
    },
  };
}

export function DocCard({ doc, onListen }: { doc: DocumentDto; onListen?: () => void }) {
  const nav = useNavigate();
  const actions = useDocActions();
  const constitution = doc.id === CONSTITUTION_ID;
  return (
    <div className="card tap" role="link" tabIndex={0} onClick={() => nav(constitution ? '/constitution' : `/doc/${doc.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && nav(constitution ? '/constitution' : `/doc/${doc.id}`)}>
      <div className="doc-card">
        <div className={`doc-cover ${constitution ? 'constitution' : ''}`}>{coverLabel(doc)}</div>
        <div className="grow">
          <div className="doc-title">{doc.shortTitle}</div>
          <div className="doc-meta">{docMeta(doc)}</div>
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            {doc.audioStatus === 'available'
              ? <span className="badge audio"><Icon name="headphones" size={13} /> Доступно аудио</span>
              : <span className="badge soon"><Icon name="clock" size={13} /> Озвучка в разработке</span>}
            {doc.verifiedAt ? null : <span className="badge test">Реквизиты не проверены</span>}
            {doc.votes > 0 && doc.audioStatus !== 'available' ? <span className="badge soon"><Icon name="vote" size={13} /> {doc.votes}</span> : null}
          </div>
        </div>
        <div className="stack-s" style={{ justifyItems: 'center' }}>
          <button className={`play-fab ${constitution ? '' : 'muted-fab'}`} aria-label={constitution ? 'Слушать' : 'Слушать (озвучка в разработке)'}
            onClick={(e) => { e.stopPropagation(); onListen?.(); }}>
            <Icon name="play" fill size={18} />
          </button>
          <button className={`icon-btn ${doc.isFavorite ? 'on' : ''}`} aria-label={doc.isFavorite ? 'Убрать из избранного' : 'В избранное'} aria-pressed={doc.isFavorite}
            onClick={(e) => { e.stopPropagation(); void actions.favorite(doc); }}>
            <Icon name="star" fill={doc.isFavorite} size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Нажатие «Слушать»: Конституция — реальное воспроизведение, остальные — честный экран «в разработке». */
export function useListen() {
  const player = usePlayer();
  const nav = useNavigate();
  const [soon, setSoon] = useState<DocumentDto | null>(null);
  const listen = (doc: DocumentDto) => {
    if (doc.id === CONSTITUTION_ID) {
      if (player.track) player.toggle();
      else player.playKey('intro');
      nav('/player');
      return;
    }
    track('document_listen_unavailable', { doc: doc.id });
    setSoon(doc);
  };
  const sheet = <ComingSoonSheet doc={soon} onClose={() => setSoon(null)} />;
  return { listen, sheet };
}

export function ComingSoonSheet({ doc, onClose }: { doc: DocumentDto | null; onClose: () => void }) {
  const actions = useDocActions();
  const [busy, setBusy] = useState<string | null>(null);
  const [cur, setCur] = useState<DocumentDto | null>(null);
  const d = cur && doc && cur.id === doc.id ? cur : doc;
  if (!d) return null;
  const act = async (kind: 'notify' | 'vote') => {
    setBusy(kind);
    const res = await actions[kind](d);
    if (res) setCur(res);
    setBusy(null);
  };
  return (
    <Sheet open={!!doc} onClose={() => { setCur(null); onClose(); }} title="Озвучка скоро появится">
      <p className="muted" style={{ marginTop: 0 }}>
        Аудиоверсия «{d.shortTitle}» в разработке. В бета-версии озвучена только Конституция РФ — мы не подставляем черновой или чужой звук.
      </p>
      <div className="state-box info" style={{ marginBottom: 12 }}>
        <Icon name="info" size={18} />
        <span>Пока можно открыть официальный текст документа, сохранить его в избранное и проголосовать — так мы решаем, что озвучить следующим.</span>
      </div>
      <div className="stack-s">
        <button className={`btn block ${d.notify ? 'ghost' : 'primary'}`} disabled={busy !== null} onClick={() => act('notify')}>
          {busy === 'notify' ? <Spinner /> : <Icon name="bell" size={18} />} {d.notify ? 'Вы подписаны · отменить' : 'Сообщить о выходе аудио'}
        </button>
        <button className={`btn block ${d.voted ? 'ghost' : ''}`} disabled={busy !== null} onClick={() => act('vote')}>
          {busy === 'vote' ? <Spinner /> : <Icon name="vote" size={18} />} {d.voted ? `Ваш голос учтён (${d.votes}) · снять` : `Голосовать за озвучку${d.votes ? ` (${d.votes})` : ''}`}
        </button>
        {d.officialUrl ? (
          <button className="btn ghost block" onClick={() => openExternal(d.officialUrl!)}>
            <Icon name="external" size={18} /> Открыть официальный текст
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
