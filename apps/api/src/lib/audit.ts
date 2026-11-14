import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

type Db = Pick<Prisma.TransactionClient, 'auditLog'>;

/** Records an important admin action. Pass a transaction client to make it part of the same transaction. */
export async function audit(
  actorId: number,
  action: string,
  entity: string,
  entityId?: number | string,
  db: Db = prisma,
): Promise<void> {
  await db.auditLog.create({
    data: { actorId, action, entity, entityId: entityId === undefined ? null : String(entityId) },
  });
}
