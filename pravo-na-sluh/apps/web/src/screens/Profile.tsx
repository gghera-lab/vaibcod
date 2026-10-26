// Профиль: статистика, подписка, приглашение друзей, настройки, приватность, поддержка, документы.

import type { MeDto, SettingsDto } from '@pravo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { ErrorState, Skeleton, Spinner, Toggle, TopBar, useToast } from '../components/ui.tsx';
import { setAnalyticsEnabled, track } from '../lib/analytics.ts';
import { authHeader, del, patch, post, resetDevAuth } from '../lib/api.ts';
import { dateRu, dateShort, duration, plural } from '../lib/format.ts';
import { useConfig, useMe, usePayments, useReferrals, useStats } from '../lib/hooks.ts';
import { confirmDialog, haptic, openExternal, shareLink } from '../lib/telegram.ts';

export function ProfileScreen() {
  const me = useMe();
  const stats = useStats();
  const nav = useNavigate();
  if (!me.data) return <Screen><TopBar title="Профиль" /><Skeleton h={120} /></Screen>;
  const u = me.data.user;
  const e = me.data.entitlement;
  const s = stats.data;
  const max = Math.max(1, ...(s?.last14Days.map((d) => d.listenedMs) ?? [1]));

  return (
    <Screen>
      <TopBar title="Профиль" />
      <section className="card row">
        <div className="doc-cover constitution" style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', padding: 0, fontSize: 18 }}>{(u.firstName ?? 'П')[0]}</div>
        <div className="grow">
          <div className="doc-title">{u.firstName ?? 'Пользователь'}{u.isDevUser ? <span className="badge test" style={{ marginLeft: 6 }}>тест</span> : null}</div>
          <div className="doc-meta">{u.username ? `@${u.username} · ` : ''}с {dateRu(u.createdAt)}</div>
        </div>
      </section>

      <button className={`card tap ${e.pro ? '' : 'hero'}`} style={{ marginTop: 12 }} onClick={() => nav('/pro')}>
        <div className="row">
          <Icon name="crown" />
          <div className="grow">
            <div className="doc-title" style={{ color: e.pro ? undefined : '#fff' }}>{e.pro ? `Pro активна${e.isTest ? ' (тестовая)' : ''}` : 'Бесплатный доступ'}</div>
            <div className="doc-meta" style={{ color: e.pro ? undefined : 'rgba(255,255,255,0.8)' }}>
              {e.pro
                ? e.source === 'referral' ? `Бонус за приглашение · до ${dateShort(e.until)}` : `${e.cancelAtPeriodEnd ? 'Доступ до' : 'Продление'} ${dateShort(e.until)}`
                : 'Аудиокнига бесплатно. Pro — все тесты и расширенная статистика'}
            </div>
          </div>
          <Icon name="right" />
        </div>
      </button>

      <button className="card tap" style={{ marginTop: 12 }} onClick={() => nav('/profile/invite')}>
        <div className="row">
          <Icon name="gift" />
          <div className="grow">
            <div className="doc-title">Пригласить друга</div>
            <div className="doc-meta">7 дней Pro вам и другу, когда он дослушает первую статью</div>
          </div>
          <Icon name="right" />
        </div>
      </button>

      <h2 className="section">Статистика</h2>
      {!s ? (stats.isError ? <ErrorState error={stats.error} onRetry={() => stats.refetch()} /> : <Skeleton h={80} n={2} />) : (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="v">{duration(s.listenedMs)}</div><div className="l">прослушано материала</div></div>
            <div className="stat"><div className="v">{s.articlesCompleted}<span className="hint"> / {s.articlesTotal}</span></div><div className="l">статей изучено</div></div>
            <div className="stat"><div className="v">{s.quizzes.finished}{s.quizzes.avgPct != null ? <span className="hint"> · {s.quizzes.avgPct}%</span> : null}</div><div className="l">тестов пройдено (средний результат)</div></div>
            <div className="stat"><div className="v">{s.streakDays} <Icon name="flame" size={18} /></div><div className="l">{plural(s.streakDays, 'день', 'дня', 'дней')} подряд · всего {s.activeDays}</div></div>
            <div className="stat"><div className="v">{s.reviews.total}{s.reviews.accuracy != null ? <span className="hint"> · {s.reviews.accuracy}%</span> : null}</div><div className="l">повторений (точность)</div></div>
            <div className="stat"><div className="v">{s.favorites}</div><div className="l">в избранном</div></div>
          </div>
          <div className="card flat" style={{ marginTop: 12 }}>
            <div className="hint" style={{ marginBottom: 8 }}>Прослушивание за 14 дней</div>
            <div className="bar-chart" aria-label="Прослушивание по дням">
              {s.last14Days.map((d) => <span key={d.day} className={d.listenedMs ? '' : 'zero'} title={`${dateShort(d.day)}: ${duration(d.listenedMs)}`} style={{ height: `${Math.max(3, (d.listenedMs / max) * 100)}%` }} />)}
            </div>
          </div>
          {s.retention ? (
            <div className="card flat" style={{ marginTop: 12 }}>
              <div className="doc-title" style={{ marginBottom: 6 }}>Удержание по интервалам <span className="badge pro">Pro</span></div>
              {s.retention.map((r) => (
                <div key={r.bucket} className="row" style={{ padding: '4px 0' }}>
                  <span className="grow small">{r.bucket}</span>
                  <span className="small muted">{r.answers ? `${r.accuracy}% · ${r.answers} отв.` : 'нет данных'}</span>
                </div>
              ))}
              <p className="hint" style={{ marginBottom: 0 }}>Точность ваших ответов в зависимости от того, сколько дней прошло с прошлого повторения. Это ваши фактические результаты, а не обещание метода.</p>
            </div>
          ) : null}
        </>
      )}

      <h2 className="section">Настройки и помощь</h2>
      <div className="list">
        <MenuItem icon="headphones" title="Аудио и приложение" sub="Голос, скорость, автопереход, тема" onClick={() => nav('/profile/settings')} />
        <MenuItem icon="bell" title="Уведомления" sub="Повторения, незавершённая статья, выход аудиоверсий" onClick={() => nav('/profile/settings#notifications')} />
        <MenuItem icon="card" title="Подписка и платежи" sub="Тарифы, история, управление" onClick={() => nav('/profile/payments')} />
        <MenuItem icon="shield" title="Приватность" sub="Данные, аналитика, удаление аккаунта" onClick={() => nav('/profile/privacy')} />
        <MenuItem icon="help" title="Поддержка" sub="Сообщить об ошибке, предложить идею" onClick={() => nav('/profile/support')} />
        {me.data.isAdmin ? <MenuItem icon="sparkle" title="Метрики продукта" sub="Только для администраторов" onClick={() => nav('/admin')} /> : null}
      </div>

      <h2 className="section">Документы</h2>
      <div className="list">
        <MenuItem icon="doc" title="Пользовательское соглашение" onClick={() => nav('/legal/terms')} />
        <MenuItem icon="doc" title="Политика обработки персональных данных" onClick={() => nav('/legal/privacy')} />
        <MenuItem icon="doc" title="Условия подписки и оплаты" onClick={() => nav('/legal/subscription')} />
        <MenuItem icon="doc" title="Правила уведомлений" onClick={() => nav('/legal/notifications')} />
        <MenuItem icon="info" title="Ограничения информационного сервиса" onClick={() => nav('/legal/disclaimer')} />
      </div>
      <p className="hint center" style={{ marginTop: 16 }}>Право на слух · бета 0.1 · Аудио и тексты в приложении не являются официальным опубликованием</p>
    </Screen>
  );
}

function MenuItem({ icon, title, sub, onClick }: { icon: string; title: string; sub?: string; onClick: () => void }) {
  return (
    <button className="list-item" onClick={onClick}>
      <Icon name={icon} />
      <div className="grow"><div className="title">{title}</div>{sub ? <div className="sub">{sub}</div> : null}</div>
      <Icon name="right" className="chev" />
    </button>
  );
}

function useSaveSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  return async (p: Partial<SettingsDto>) => {
    const prev = qc.getQueryData<MeDto>(['me']);
    if (prev) qc.setQueryData(['me'], { ...prev, settings: { ...prev.settings, ...p } });
    try {
      const settings = await patch<SettingsDto>('/api/me/settings', p);
      const cur = qc.getQueryData<MeDto>(['me']);
      if (cur) qc.setQueryData(['me'], { ...cur, settings });
      haptic.select();
    } catch (e) {
      if (prev) qc.setQueryData(['me'], prev);
      toast(e instanceof Error ? e.message : 'Не удалось сохранить', 'error');
    }
  };
}

export function SettingsScreen() {
  const me = useMe();
  const save = useSaveSettings();
  if (!me.data) return <Screen><TopBar title="Настройки" back /><Skeleton h={60} n={5} /></Screen>;
  const s = me.data.settings;
  return (
    <Screen>
      <TopBar title="Настройки" back />
      <h2 className="section">Аудио</h2>
      <div className="list">
        <SettingRow title="Автопереход к следующей статье" sub="Слушать Конституцию подряд"><Toggle label="Автопереход" checked={s.autoAdvance} onChange={(v) => save({ autoAdvance: v })} /></SettingRow>
        <SettingRow title="Сигнал между главами" sub="Короткий тихий звук перед новой главой"><Toggle label="Сигнал между главами" checked={s.chapterChime} onChange={(v) => save({ chapterChime: v })} /></SettingRow>
        <SettingRow title="Скорость по умолчанию" sub={`${s.playbackRate}×`}>
          <select className="input" style={{ width: 96, minHeight: 40, padding: '6px 8px' }} value={s.playbackRate} onChange={(e) => save({ playbackRate: Number(e.target.value) })} aria-label="Скорость">
            {[0.75, 0.9, 1, 1.15, 1.25, 1.5, 1.75, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </SettingRow>
        <SettingRow title="Голос" sub="Выбор голоса — в плеере (кнопка «Голос»)"><span className="hint">{s.voiceId ?? 'по умолчанию'}</span></SettingRow>
      </div>
      <h2 className="section">Оформление</h2>
      <div className="segmented">
        {(['auto', 'light', 'dark'] as const).map((t) => <button key={t} className={s.theme === t ? 'on' : ''} onClick={() => save({ theme: t })}>{t === 'auto' ? 'Как в Telegram' : t === 'light' ? 'Светлая' : 'Тёмная'}</button>)}
      </div>
      <h2 className="section" id="notifications">Уведомления в Telegram</h2>
      <div className="list">
        <SettingRow title="Напоминать о повторении" sub="Не чаще раза в день, когда есть карточки к повторению"><Toggle label="Напоминания о повторении" checked={s.notifyReviews} onChange={(v) => save({ notifyReviews: v })} /></SettingRow>
        <SettingRow title="Напоминать о незавершённой статье" sub="Если статья начата, но не дослушана и вы не занимались 2 дня — один раз"><Toggle label="Напоминания о незавершённой статье" checked={s.notifyContinue} onChange={(v) => save({ notifyContinue: v })} /></SettingRow>
        <SettingRow title="Выход аудиоверсий" sub="Для документов, где вы нажали «Следить»"><Toggle label="Выход аудиоверсий" checked={s.notifyAudioReleases} onChange={(v) => save({ notifyAudioReleases: v })} /></SettingRow>
      </div>
      <p className="hint">Сообщения отправляет бот «Право на слух». Рекламных рассылок нет. Подробнее — в «Правилах уведомлений».</p>
      <h2 className="section">Ежедневная цель</h2>
      <div className="segmented">
        {[5, 10, 20, 30].map((m) => <button key={m} className={s.dailyGoalMin === m ? 'on' : ''} onClick={() => save({ dailyGoalMin: m })}>{m} мин</button>)}
      </div>
    </Screen>
  );
}

function SettingRow({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="list-item">
      <div className="grow"><div className="title">{title}</div>{sub ? <div className="sub">{sub}</div> : null}</div>
      {children}
    </div>
  );
}

export function PrivacyScreen() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  if (!me.data) return <Screen><TopBar title="Приватность" back /><Skeleton h={60} n={4} /></Screen>;

  const setOptOut = async (v: boolean) => {
    try {
      const updated = await patch<MeDto>('/api/me/privacy', { analyticsOptOut: v });
      qc.setQueryData(['me'], updated);
      setAnalyticsEnabled(!v);
      toast(v ? 'Аналитика отключена, накопленные события удалены' : 'Аналитика включена');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка', 'error');
    }
  };
  const exportData = async () => {
    try {
      const res = await fetch('/api/me/export', { headers: authHeader() });
      if (!res.ok) throw new Error('Не удалось сформировать выгрузку');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pravo-na-sluh-my-data.json';
      a.click();
      URL.revokeObjectURL(url);
      toast('Файл с вашими данными сформирован');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ошибка выгрузки', 'error');
    }
  };
  const deleteAccount = async () => {
    if (confirm !== 'УДАЛИТЬ') return;
    if (!(await confirmDialog('Удалить аккаунт и все данные обучения? Это действие необратимо.'))) return;
    setBusy(true);
    try {
      await del('/api/me', { confirm: 'УДАЛИТЬ' });
      resetDevAuth();
      qc.clear();
      toast('Аккаунт и данные удалены');
      nav('/');
      window.location.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось удалить', 'error');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Приватность" back />
      <div className="source-box">
        Мы получаем от Telegram только ваш ID, имя и username (для входа без пароля), храним прогресс обучения, избранное и сведения о платежах.
        Номера телефона, контакты и переписку мы не получаем. Платёжные данные карт обрабатывает Telegram, а не мы.
      </div>
      <h2 className="section">Аналитика</h2>
      <div className="list">
        <div className="list-item">
          <div className="grow"><div className="title">Обезличенная продуктовая аналитика</div><div className="sub">События вида «начал прослушивание», «прошёл тест» — без содержания ответов</div></div>
          <Toggle label="Аналитика" checked={!me.data.user.analyticsOptOut} onChange={(v) => setOptOut(!v)} />
        </div>
      </div>
      <h2 className="section">Ваши данные</h2>
      <button className="btn block" onClick={exportData}><Icon name="download" size={18} /> Выгрузить мои данные (JSON)</button>
      <h2 className="section">Удаление аккаунта</h2>
      <div className="card flat stack-s">
        <p className="small muted" style={{ margin: 0 }}>Будут удалены профиль, прогресс, избранное, закладки, ответы и голоса. Активная подписка Telegram Stars не отменяется автоматически — отмените её в «Подписке» до удаления.</p>
        <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Введите УДАЛИТЬ для подтверждения" aria-label="Подтверждение удаления" />
        <button className="btn danger block" disabled={confirm !== 'УДАЛИТЬ' || busy} onClick={deleteAccount}>{busy ? <Spinner /> : <Icon name="trash" size={18} />} Удалить аккаунт и данные</button>
      </div>
      <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => nav('/legal/privacy')}>Политика обработки персональных данных</button>
    </Screen>
  );
}

export function SupportScreen() {
  const config = useConfig();
  const toast = useToast();
  const [kind, setKind] = useState<'bug' | 'idea' | 'audio_error' | 'payment' | 'other'>('bug');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await post('/api/feedback', { kind, message, context: { path: window.location.pathname, ua: navigator.userAgent.slice(0, 180) } });
      haptic.success();
      toast('Спасибо! Сообщение отправлено команде');
      setMessage('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось отправить', 'error');
    } finally {
      setBusy(false);
    }
  };
  const contact = config.data?.supportContact ?? '';
  return (
    <Screen>
      <TopBar title="Поддержка" back />
      <div className="chips" style={{ marginBottom: 12 }}>
        {[['bug', 'Ошибка'], ['audio_error', 'Ошибка в озвучке'], ['idea', 'Идея'], ['payment', 'Оплата'], ['other', 'Другое']].map(([k, t]) => (
          <button key={k} className={`chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k as typeof kind)}>{t}</button>
        ))}
      </div>
      <textarea className="input" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000}
        placeholder={kind === 'audio_error' ? 'Статья и что звучит неверно (ударение, число, пропуск)…' : 'Опишите вопрос или предложение…'} aria-label="Сообщение" />
      <button className="btn primary block" style={{ marginTop: 10 }} disabled={message.trim().length < 3 || busy} onClick={send}>{busy ? <Spinner /> : 'Отправить'}</button>
      <div className="source-box" style={{ marginTop: 16 }}>
        <b>Вопросы по оплате:</b> команда /paysupport в боте или {contact}. Поддержка Telegram не рассматривает покупки в ботах — по ним отвечаем мы.
        {contact.startsWith('@') ? <div style={{ marginTop: 8 }}><button className="btn small ghost" onClick={() => openExternal(`https://t.me/${contact.slice(1)}`)}><Icon name="external" size={16} /> Написать {contact}</button></div> : null}
      </div>
    </Screen>
  );
}

export function InviteScreen() {
  const q = useReferrals();
  const toast = useToast();
  const r = q.data;
  if (!r) return <Screen><TopBar title="Пригласить друга" back />{q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Skeleton h={160} n={2} />}</Screen>;
  const text = `Слушаю Конституцию РФ в «Праве на слух»: аудио, текст перед глазами и вопросы по каждой статье. Присоединяйся — дослушаешь первую статью, и мы оба получим ${r.bonusDays} дней Pro.`;
  const share = () => {
    if (!r.link) return;
    track('referral_share', { via: 'telegram' });
    haptic.tap();
    shareLink(r.link, text);
  };
  const copy = async () => {
    if (!r.link) return;
    try {
      await navigator.clipboard.writeText(r.link);
      track('referral_share', { via: 'copy' });
      haptic.success();
      toast('Ссылка скопирована');
    } catch {
      toast('Не удалось скопировать — выделите ссылку вручную', 'error');
    }
  };
  const left = Math.max(0, r.maxRewards - r.rewarded);

  return (
    <Screen>
      <TopBar title="Пригласить друга" back />
      <section className="hero card">
        <div className="eyebrow">Приглашение</div>
        <h2>{r.bonusDays} дней Pro — вам и другу</h2>
        <p>Друг открывает «Право на слух» по вашей ссылке и дослушивает первую статью Конституции до конца — после этого бонус получаете вы оба.</p>
        {r.link ? (
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn on-hero grow" onClick={share}><Icon name="share" size={18} /> Поделиться</button>
            <button className="btn icon" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }} onClick={copy} aria-label="Скопировать ссылку"><Icon name="copy" size={18} /></button>
          </div>
        ) : null}
      </section>
      {r.link ? (
        <div className="source-box" style={{ marginTop: 12, userSelect: 'all', wordBreak: 'break-all' }}>{r.link}</div>
      ) : (
        <div className="state-box warn" style={{ marginTop: 12 }}>Ссылка появится, когда к приложению будет подключён Telegram-бот (BOT_USERNAME). Ваш код: {r.code}</div>
      )}

      <h2 className="section">Ваши приглашения</h2>
      <div className="stat-grid">
        <div className="stat"><div className="v">{r.invited}</div><div className="l">{plural(r.invited, 'друг перешёл', 'друга перешли', 'друзей перешли')} по ссылке</div></div>
        <div className="stat"><div className="v">{r.qualified}</div><div className="l">дослушали первую статью</div></div>
        <div className="stat"><div className="v">{r.rewarded * r.bonusDays}</div><div className="l">{plural(r.rewarded * r.bonusDays, 'день', 'дня', 'дней')} Pro получено</div></div>
        <div className="stat"><div className="v">{left}</div><div className="l">{plural(left, 'бонус', 'бонуса', 'бонусов')} ещё доступно</div></div>
      </div>

      <h2 className="section">Как это работает</h2>
      <div className="card flat stack-s">
        <p className="small" style={{ margin: 0 }}>1. Отправьте ссылку другу в Telegram.</p>
        <p className="small" style={{ margin: 0 }}>2. Друг впервые открывает приложение по ссылке.</p>
        <p className="small" style={{ margin: 0 }}>3. Когда он дослушает первую статью до конца, вы оба получите по {r.bonusDays} дней Pro — придёт сообщение от бота.</p>
      </div>
      <p className="hint">Засчитываются только новые пользователи, пригласить себя нельзя. Бонус начисляется не более чем за {r.maxRewards} {plural(r.maxRewards, 'друга', 'друзей', 'друзей')}. Если у вас уже есть Pro, бонусные дни добавятся после окончания оплаченного периода.</p>
    </Screen>
  );
}

export function PaymentsScreen() {
  const q = usePayments();
  const me = useMe();
  const nav = useNavigate();
  const STATUS: Record<string, string> = { paid: 'Оплачено', refunded: 'Возврат', created: 'Создан', pre_checkout: 'Ожидает', failed: 'Ошибка', cancelled: 'Отменён' };
  return (
    <Screen>
      <TopBar title="Платежи" back />
      <button className="btn primary block" onClick={() => nav('/pro')}><Icon name="crown" size={18} /> Тарифы и управление подпиской</button>
      <h2 className="section">История платежей</h2>
      {q.isLoading ? <Skeleton h={56} n={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.length ? (
        <div className="list">
          {q.data.map((p) => (
            <div key={p.id} className="list-item">
              <div className="grow"><div className="title">{p.productTitle} {p.isTest ? <span className="badge test">тест</span> : null}</div><div className="sub">{dateShort(p.paidAt ?? p.createdAt)} · {STATUS[p.status] ?? p.status}</div></div>
              <b>{p.amount} ⭐</b>
            </div>
          ))}
        </div>
      ) : <p className="hint">Платежей пока нет.</p>}
      {me.data?.entitlement.pro ? <p className="hint">Доступ Pro до {dateShort(me.data.entitlement.until)}.</p> : null}
    </Screen>
  );
}
