// Избранное: документы, статьи Конституции, закладки в аудио.

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocCard, useListen } from '../components/DocCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { Empty, ErrorState, Skeleton, TopBar, useToast } from '../components/ui.tsx';
import { del } from '../lib/api.ts';
import { clock, dateShort } from '../lib/format.ts';
import { useFavorites } from '../lib/hooks.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';

export function FavoritesScreen() {
  const q = useFavorites();
  const [tab, setTab] = useState<'docs' | 'articles' | 'bookmarks'>('docs');
  const nav = useNavigate();
  const player = usePlayer();
  const qc = useQueryClient();
  const toast = useToast();
  const { listen, sheet } = useListen();

  const removeBookmark = async (id: number) => {
    try {
      await del(`/api/bookmarks/${id}`);
      void qc.invalidateQueries({ queryKey: ['favorites'] });
      toast('Закладка удалена');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'error');
    }
  };

  return (
    <Screen>
      <TopBar title="Избранное" />
      <div className="segmented" style={{ marginBottom: 14 }}>
        <button className={tab === 'docs' ? 'on' : ''} onClick={() => setTab('docs')}>Документы{q.data ? ` · ${q.data.documents.length}` : ''}</button>
        <button className={tab === 'articles' ? 'on' : ''} onClick={() => setTab('articles')}>Статьи{q.data ? ` · ${q.data.articles.length}` : ''}</button>
        <button className={tab === 'bookmarks' ? 'on' : ''} onClick={() => setTab('bookmarks')}>Закладки{q.data ? ` · ${q.data.bookmarks.length}` : ''}</button>
      </div>
      {q.isLoading ? <Skeleton h={80} n={3} /> : q.isError || !q.data ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          {tab === 'docs' ? (q.data.documents.length ? <div className="stack">{q.data.documents.map((d) => <DocCard key={d.id} doc={d} onListen={() => listen(d)} />)}</div> : (
            <Empty icon="star" title="Нет избранных документов" action={<button className="btn primary" onClick={() => nav('/library')}>Открыть библиотеку</button>}>Нажмите ☆ на карточке документа, чтобы сохранить его здесь.</Empty>
          )) : null}
          {tab === 'articles' ? (q.data.articles.length ? (
            <div className="list">
              {q.data.articles.map((a) => (
                <button key={a.articleKey} className="list-item" onClick={() => nav(`/constitution/${a.articleKey}`)}>
                  <Icon name="star" fill size={18} className="on" />
                  <div className="grow"><div className="title">{a.title} Конституции РФ</div><div className="sub ellipsis">{a.firstLine}</div></div>
                  <Icon name="right" className="chev" />
                </button>
              ))}
            </div>
          ) : <Empty icon="text" title="Нет избранных статей" action={<button className="btn primary" onClick={() => nav('/constitution')}>Открыть Конституцию</button>}>Отмечайте важные статьи звёздочкой в тексте или в плеере.</Empty>) : null}
          {tab === 'bookmarks' ? (q.data.bookmarks.length ? (
            <div className="list">
              {q.data.bookmarks.map((b) => (
                <div key={b.id} className="list-item">
                  <button className="play-fab" aria-label={`Слушать с ${clock(b.positionMs)}`} onClick={() => { player.playKey(b.trackKey, { positionMs: b.positionMs }); nav('/player'); }}>
                    <Icon name="play" fill size={16} />
                  </button>
                  <div className="grow"><div className="title">{b.trackTitle} · {clock(b.positionMs)}</div><div className="sub">{b.note ?? 'Без заметки'} · {dateShort(b.createdAt)}</div></div>
                  <button className="icon-btn" aria-label="Удалить закладку" onClick={() => removeBookmark(b.id)}><Icon name="trash" size={18} /></button>
                </div>
              ))}
            </div>
          ) : <Empty icon="bookmark" title="Закладок пока нет">В плеере нажмите «Закладка», чтобы вернуться к важному месту.</Empty>) : null}
        </>
      )}
      {sheet}
    </Screen>
  );
}
