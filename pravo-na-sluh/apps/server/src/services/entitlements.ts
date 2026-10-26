// Права доступа к Pro: вычисляются только на сервере по таблице subscriptions.

import type { EntitlementDto } from '@pravo/shared';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import type { DB } from '../db/client.ts';
import { products, subscriptions } from '../db/schema.ts';

export async function getEntitlement(db: DB, userId: number, now = new Date()): Promise<EntitlementDto> {
  const rows = await db.select({ s: subscriptions, recurring: products.recurring }).from(subscriptions)
    .innerJoin(products, eq(products.id, subscriptions.productId))
    .where(and(eq(subscriptions.userId, userId), inArray(subscriptions.status, ['active', 'canceled']), gt(subscriptions.currentPeriodEnd, now)))
    .orderBy(desc(subscriptions.currentPeriodEnd));
  // Действующая автопродляемая подписка главнее разовых и бонусных дней после неё:
  // по ней показываются дата продления и управление автопродлением.
  const active = (rows.find((r) => r.recurring && !r.s.cancelAtPeriodEnd) ?? rows[0])?.s;
  if (active) {
    return {
      pro: true,
      until: active.currentPeriodEnd.toISOString(),
      productId: active.productId,
      source: active.source,
      status: active.cancelAtPeriodEnd ? 'canceled' : 'active',
      cancelAtPeriodEnd: active.cancelAtPeriodEnd,
      isTest: active.source === 'sandbox',
    };
  }
  const [last] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.updatedAt)).limit(1);
  return {
    pro: false,
    until: last ? last.currentPeriodEnd.toISOString() : null,
    productId: last?.productId ?? null,
    source: last?.source ?? null,
    status: last ? (last.status === 'refunded' ? 'refunded' : 'expired') : 'none',
    cancelAtPeriodEnd: false,
    isTest: last?.source === 'sandbox',
  };
}
