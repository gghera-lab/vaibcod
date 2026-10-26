import type { DB } from '../db/client.ts';
import { auditLog } from '../db/schema.ts';

export async function audit(db: DB, actor: string, action: string, entity: string, entityId: string | number | null, data?: unknown) {
  await db.insert(auditLog).values({ actor, action, entity, entityId: entityId == null ? null : String(entityId), data: (data ?? null) as never });
}
