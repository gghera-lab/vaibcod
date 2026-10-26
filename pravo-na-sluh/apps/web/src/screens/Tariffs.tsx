// Тарифы и оплата: Telegram Stars (в Telegram) или явно обозначенная тестовая оплата (sandbox).

import type { EntitlementDto, InvoiceDto, MeDto, ProductDto } from '@pravo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.tsx';
import { Screen } from '../components/Layout.tsx';
import { ErrorState, Sheet, Skeleton, Spinner, TopBar, useToast } from '../components/ui.tsx';
import { track } from '../lib/analytics.ts';
import { ApiError, get, post } from '../lib/api.ts';
import { dateRu } from '../lib/format.ts';
import { useMe, useProducts } from '../lib/hooks.ts';
import { confirmDialog, haptic, inTelegram, tg } from '../lib/telegram.ts';

export function TariffsScreen() {
  const products = useProducts();
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [sandbox, setSandbox] = useState<{ paymentId: number; amount: number; productTitle: string } | null>(null);
  useEffect(() => { track('paywall_view'); }, []);

  const setEntitlement = (e: EntitlementDto) => {
    const cur = qc.getQueryData<MeDto>(['me']);
    if (cur) qc.setQueryData(['me'], { ...cur, entitlement: e });
    void qc.invalidateQueries({ queryKey: ['payments'] });
    void qc.invalidateQueries({ queryKey: ['memory-overview'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };

  /** После закрытия окна оплаты проверяем статус на сервере — клиентскому статусу не доверяем. */
  const waitForPayment = async (paymentId: number) => {
    for (let i = 0; i < 15; i++) {
      const r = await get<{ status: string; entitlement: EntitlementDto }>(`/api/billing/payments/${paymentId}`);
      if (r.status === 'paid') { setEntitlement(r.entitlement); return true; }
      await new Promise((res) => setTimeout(res, 1500));
    }
    return false;
  };

  const buy = async (p: ProductDto) => {
    setBusy(p.id);
    track('purchase_start', { product: p.id });
    try {
      const inv = await post<InvoiceDto>('/api/billing/invoice', { productId: p.id });
      if (inv.mode === 'sandbox') {
        setSandbox({ paymentId: inv.paymentId, amount: inv.amount, productTitle: inv.productTitle });
        return;
      }
      if (!inTelegram) {
        toast('Оплата Telegram Stars доступна только внутри Telegram', 'error');
        return;
      }
      tg!.openInvoice(inv.invoiceUrl, async (status) => {
        if (status === 'paid' || status === 'pending') {
          toast(status === 'paid' ? 'Оплата прошла, проверяем…' : 'Платёж обрабатывается…');
          const ok = await waitForPayment(inv.paymentId);
          if (ok) { haptic.success(); track('purchase_complete', { product: p.id }); toast('Доступ Pro открыт. Спасибо!'); }
          else toast('Подтверждение ещё не пришло. Доступ откроется автоматически — проверьте позже или нажмите «Восстановить доступ».');
        } else if (status === 'cancelled') {
          track('purchase_cancel', { product: p.id });
          toast('Оплата отменена');
        } else {
          track('purchase_failed', { product: p.id });
          toast('Оплата не прошла. Деньги не списаны.', 'error');
        }
        setBusy(null);
      });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не удалось создать счёт', 'error');
      track('purchase_failed', { product: p.id });
    } finally {
      if (!inTelegram) setBusy(null);
    }
  };

  const completeSandbox = async (outcome: 'paid' | 'failed' | 'cancelled') => {
    if (!sandbox) return;
    const id = sandbox.paymentId;
    setSandbox(null);
    try {
      const r = await post<{ status: string; entitlement: EntitlementDto }>(`/api/billing/sandbox/${id}/complete`, { outcome });
      setEntitlement(r.entitlement);
      if (r.status === 'paid') { haptic.success(); track('purchase_complete', { product: busy ?? '', test: true }); toast('Тестовая оплата подтверждена — Pro открыт (деньги не списывались)'); }
      else if (outcome === 'failed') { track('purchase_failed', { test: true }); toast('Тест: оплата отклонена, доступ не выдан', 'error'); }
      else { track('purchase_cancel', { test: true }); toast('Тест: оплата отменена'); }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Ошибка тестовой оплаты', 'error');
    } finally {
      setBusy(null);
    }
  };

  const autoRenew = async (enabled: boolean) => {
    if (!enabled && !(await confirmDialog('Отключить автопродление? Доступ сохранится до конца оплаченного периода.'))) return;
    try {
      setEntitlement(await post<EntitlementDto>('/api/billing/auto-renew', { enabled }));
      toast(enabled ? 'Автопродление включено' : 'Автопродление отключено');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не удалось изменить подписку', 'error');
    }
  };
  const restore = async () => {
    try {
      const e = await post<EntitlementDto>('/api/billing/restore');
      setEntitlement(e);
      toast(e.pro ? `Доступ Pro активен до ${dateRu(e.until)}` : 'Активных покупок не найдено');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Ошибка', 'error');
    }
  };

  if (products.isLoading || !me.data) return <Screen><TopBar title="Pro" back /><Skeleton h={140} n={3} /></Screen>;
  if (products.isError || !products.data) return <Screen><TopBar title="Pro" back /><ErrorState error={products.error} onRetry={() => products.refetch()} /></Screen>;
  const { mode, free } = products.data;
  const ent = me.data.entitlement;
  const recurringActive = ent.pro && products.data.products.find((p) => p.id === ent.productId)?.recurring;

  return (
    <Screen>
      <TopBar title="Право на слух Pro" back />
      {mode === 'sandbox' ? <div className="test-banner" style={{ marginBottom: 12 }}>ТЕСТОВЫЙ РЕЖИМ ОПЛАТЫ · деньги не списываются</div> : null}
      {mode === 'disabled' ? (
        <div className="state-box warn" style={{ marginBottom: 12 }}><Icon name="info" size={18} /><span>Оплата пока не подключена: требуется настройка Telegram Stars для бота. Тарифы показаны для ознакомления.</span></div>
      ) : null}

      {ent.pro ? (
        <section className="card" style={{ borderColor: 'var(--success)' }}>
          <div className="row"><Icon name="crown" /><div className="grow"><div className="doc-title">Pro активна {ent.isTest ? <span className="badge test">тестовая</span> : null}</div>
            <div className="doc-meta">{ent.cancelAtPeriodEnd ? `Автопродление отключено, доступ до ${dateRu(ent.until)}` : recurringActive ? `Следующее продление — ${dateRu(ent.until)}` : `Доступ до ${dateRu(ent.until)}`}</div></div></div>
          {recurringActive ? (
            <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => autoRenew(ent.cancelAtPeriodEnd)}>
              {ent.cancelAtPeriodEnd ? 'Возобновить автопродление' : 'Отменить автопродление'}
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="plan" style={{ marginTop: 12 }}>
        <div className="row"><div className="grow"><div className="doc-title">{free.title}</div><div className="doc-meta">Навсегда</div></div><div className="price">0 ₽</div></div>
        <ul>{free.features.map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}</ul>
      </section>

      {products.data.products.map((p) => (
        <section key={p.id} className={`plan ${p.badge ? 'featured' : ''}`} style={{ marginTop: 12 }}>
          {p.badge ? <span className="badge pro" style={{ position: 'absolute', top: -10, right: 14 }}>{p.badge}</span> : null}
          <div className="row">
            <div className="grow"><div className="doc-title">{p.title}</div><div className="doc-meta">{p.description}</div></div>
            <div style={{ textAlign: 'right' }}><div className="price">{p.priceStars} ⭐</div><div className="hint">≈ {p.priceRubHint.toLocaleString('ru-RU')} ₽*</div></div>
          </div>
          <ul>{p.features.map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}</ul>
          <button className={`btn block ${p.badge ? 'accent' : 'primary'}`} style={{ marginTop: 14 }} disabled={mode === 'disabled' || busy !== null || (ent.pro && ent.productId === p.id && !ent.cancelAtPeriodEnd && p.recurring)}
            onClick={() => buy(p)}>
            {busy === p.id ? <Spinner /> : mode === 'sandbox' ? `Тестовая оплата · ${p.priceStars} ⭐` : `Оплатить ${p.priceStars} ⭐`}
          </button>
        </section>
      ))}

      <p className="hint" style={{ marginTop: 12 }}>
        * Цифровой доступ внутри Telegram оплачивается только Telegram Stars (правила Telegram). Рублёвая цена — ориентир; фактическая стоимость Stars зависит от способа их покупки.
        Pro не открывает доступ к аудиокнигам, которых ещё нет: состав тарифа указан выше. Оплачивая, вы принимаете <a href="/legal/subscription" onClick={(e) => { e.preventDefault(); nav('/legal/subscription'); }}>Условия подписки</a>.
      </p>
      <div className="stack-s" style={{ marginTop: 12 }}>
        <button className="btn ghost block" onClick={restore}><Icon name="repeat" size={18} /> Восстановить доступ</button>
        <button className="btn ghost block" onClick={() => nav('/profile/payments')}><Icon name="card" size={18} /> История платежей</button>
        <button className="btn ghost block" onClick={() => nav('/profile/support')}><Icon name="help" size={18} /> Для вузов и юридических компаний</button>
      </div>

      <Sheet open={!!sandbox} onClose={() => completeSandbox('cancelled')} title="Тестовая оплата">
        <div className="test-banner">ТЕСТ · реальная оплата не производится</div>
        <p className="muted">«{sandbox?.productTitle}» — {sandbox?.amount} ⭐. Выберите результат, чтобы проверить сценарий. Сервер обработает его так же, как уведомление Telegram о платеже.</p>
        <div className="stack-s">
          <button className="btn primary block" onClick={() => completeSandbox('paid')}>Подтвердить тестовую оплату</button>
          <button className="btn danger block" onClick={() => completeSandbox('failed')}>Симулировать отказ платежа</button>
          <button className="btn block" onClick={() => completeSandbox('cancelled')}>Отменить</button>
        </div>
      </Sheet>
    </Screen>
  );
}
