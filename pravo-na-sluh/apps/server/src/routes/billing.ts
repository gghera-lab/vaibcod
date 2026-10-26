// Тарифы, оплата (Telegram Stars / тестовая песочница), подписка, история платежей.

import type { PaymentDto, ProductDto } from '@pravo/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { requireUser } from '../auth/plugin.ts';
import type { AppContext } from '../app.ts';
import { completeSandbox, createInvoice, setAutoRenew } from '../billing/service.ts';
import { payments, products } from '../db/schema.ts';
import { getEntitlement } from '../services/entitlements.ts';

export function registerBillingRoutes(ctx: AppContext) {
  const { app, db, config } = ctx;
  const deps = { db, config, bot: ctx.bot };

  app.get('/api/billing/products', async () => {
    const rows = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.sort));
    const tariffs = JSON.parse(fs.readFileSync(path.join(config.CONTENT_DIR, 'tariffs.json'), 'utf8'));
    return {
      mode: config.PAYMENTS_MODE,
      free: tariffs.free,
      products: rows.map((p): ProductDto => ({
        id: p.id, title: p.title, description: p.description, priceStars: p.priceStars, priceRubHint: p.priceRubHint,
        periodDays: p.periodDays, recurring: p.recurring, features: p.features, badge: p.badge,
      })),
    };
  });

  app.get('/api/billing/subscription', async (req) => getEntitlement(db, requireUser(req).id));

  app.get('/api/billing/payments', async (req): Promise<PaymentDto[]> => {
    const user = requireUser(req);
    const rows = await db.select({ p: payments, title: products.title }).from(payments).innerJoin(products, eq(products.id, payments.productId))
      .where(eq(payments.userId, user.id)).orderBy(desc(payments.createdAt)).limit(50);
    return rows.filter((r) => r.p.status !== 'created' || Date.now() - r.p.createdAt.getTime() < 86_400_000).map((r) => ({
      id: r.p.id, productId: r.p.productId, productTitle: r.title, status: r.p.status, amount: r.p.amount, currency: r.p.currency,
      isTest: r.p.isTest, createdAt: r.p.createdAt.toISOString(), paidAt: r.p.paidAt ? r.p.paidAt.toISOString() : null,
    }));
  });

  app.post('/api/billing/invoice', async (req) => {
    const user = requireUser(req);
    const { productId } = z.object({ productId: z.string().max(32) }).parse(req.body);
    return createInvoice(deps, user.id, productId);
  });

  app.post('/api/billing/sandbox/:paymentId/complete', async (req) => {
    const user = requireUser(req);
    const { paymentId } = z.object({ paymentId: z.coerce.number().int() }).parse(req.params);
    const { outcome } = z.object({ outcome: z.enum(['paid', 'failed', 'cancelled']) }).parse(req.body);
    const result = await completeSandbox(deps, user.id, paymentId, outcome);
    return { ...result, entitlement: await getEntitlement(db, user.id) };
  });

  /** Статус конкретного платежа — клиент проверяет его после закрытия окна оплаты. */
  app.get('/api/billing/payments/:id', async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.coerce.number().int() }).parse(req.params);
    const [p] = await db.select().from(payments).where(and(eq(payments.id, id), eq(payments.userId, user.id)));
    if (!p) return { status: 'not_found' };
    return { status: p.status, entitlement: await getEntitlement(db, user.id) };
  });

  app.post('/api/billing/auto-renew', async (req) => {
    const user = requireUser(req);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await setAutoRenew(deps, user.id, enabled);
    return getEntitlement(db, user.id);
  });

  /** «Восстановить доступ»: доступ всегда вычисляется на сервере, клиент просто перезапрашивает его. */
  app.post('/api/billing/restore', async (req) => getEntitlement(db, requireUser(req).id));
}
