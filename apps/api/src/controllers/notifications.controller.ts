import type { Request, Response } from 'express';
import type { NotificationRow, NotificationsResponse } from '@lms/shared';
import { prisma } from '../config/prisma';
import { parseId } from './helpers';

const toRow = (n: { id: number; title: string; body: string; readAt: Date | null; createdAt: Date }): NotificationRow => ({
  id: n.id,
  title: n.title,
  body: n.body,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/** Latest notifications for the signed-in user, plus the unread count for the bell badge. */
export async function listNotifications(req: Request, res: Response) {
  const userId = req.auth!.id;
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  const body: NotificationsResponse = { items: items.map(toRow), unread };
  res.json(body);
}

/** updateMany with the owner in the filter: marking someone else's notification does nothing. */
export async function markNotificationRead(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  await prisma.notification.updateMany({ where: { id, userId: req.auth!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
}

export async function markAllNotificationsRead(req: Request, res: Response) {
  const result = await prisma.notification.updateMany({ where: { userId: req.auth!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ updated: result.count });
}
