import type { Request, Response } from 'express';
import { Role, doubtThreadQuery, type DoubtContact, type DoubtMessageRow, type DoubtThread, type SendDoubtInput } from '@lms/shared';
import { prisma } from '../config/prisma';
import { badRequest, forbidden, notFound } from '../middleware/errors';

/**
 * Doubts are a private conversation between a student and the instructor the admin assigned to them.
 * A student only ever talks to their current instructor; an instructor only to their assigned students.
 * The pair is checked on every call, so nobody can read or write another conversation by guessing ids.
 */

/** Works out (studentId, instructorId) for the signed-in user and the person they want to talk to. */
async function resolvePair(req: Request, otherId: number) {
  const { id, role } = req.auth!;
  if (role === Role.STUDENT) {
    const me = await prisma.user.findUnique({ where: { id }, select: { instructorId: true } });
    if (!me?.instructorId) throw badRequest('You do not have an instructor yet. The admin will assign one soon.');
    if (me.instructorId !== otherId) throw notFound('Conversation not found');
    return { studentId: id, instructorId: otherId, fromStudent: true };
  }
  if (role === Role.INSTRUCTOR) {
    const student = await prisma.user.findFirst({ where: { id: otherId, role: Role.STUDENT, instructorId: id }, select: { id: true } });
    if (!student) throw notFound('Conversation not found');
    return { studentId: otherId, instructorId: id, fromStudent: false };
  }
  throw forbidden();
}

/** The people the signed-in user can send doubts to, newest conversation first, with unread counts. */
export async function listDoubtContacts(req: Request, res: Response) {
  const { id, role } = req.auth!;
  const items: DoubtContact[] = role === Role.STUDENT ? await studentContacts(id) : await instructorContacts(id);
  items.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? '') || a.name.localeCompare(b.name));
  res.json({ items });
}

/** A student has at most one contact: their instructor. */
async function studentContacts(studentId: number): Promise<DoubtContact[]> {
  const me = await prisma.user.findUnique({
    where: { id: studentId },
    select: { instructor: { select: { id: true, name: true, expertise: true } } },
  });
  const ins = me?.instructor;
  if (!ins) return [];
  const where = { studentId, instructorId: ins.id };
  const [last, unread] = await Promise.all([
    prisma.doubtMessage.findFirst({ where, orderBy: { id: 'desc' }, select: { body: true, createdAt: true } }),
    prisma.doubtMessage.count({ where: { ...where, fromStudent: false, readAt: null } }),
  ]);
  return [{ id: ins.id, name: ins.name, subtitle: ins.expertise, lastMessage: last?.body ?? null, lastAt: last?.createdAt.toISOString() ?? null, unread }];
}

/** An instructor sees every assigned student. Two grouped queries keep this fast for large classes. */
async function instructorContacts(instructorId: number): Promise<DoubtContact[]> {
  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT, instructorId },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  if (students.length === 0) return [];
  const ids = students.map((s) => s.id);
  const [lastIds, unreadRows] = await Promise.all([
    prisma.doubtMessage.groupBy({ by: ['studentId'], where: { instructorId, studentId: { in: ids } }, _max: { id: true } }),
    prisma.doubtMessage.groupBy({ by: ['studentId'], where: { instructorId, studentId: { in: ids }, fromStudent: true, readAt: null }, _count: { _all: true } }),
  ]);
  const lastMessages = await prisma.doubtMessage.findMany({
    where: { id: { in: lastIds.map((r) => r._max.id).filter((v): v is number => v !== null) } },
    select: { studentId: true, body: true, createdAt: true },
  });
  const lastBy = new Map(lastMessages.map((m) => [m.studentId, m] as const));
  const unreadBy = new Map(unreadRows.map((r) => [r.studentId, r._count._all] as const));
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    subtitle: s.email,
    lastMessage: lastBy.get(s.id)?.body ?? null,
    lastAt: lastBy.get(s.id)?.createdAt.toISOString() ?? null,
    unread: unreadBy.get(s.id) ?? 0,
  }));
}

/** One conversation. Opening it marks the other person's messages as read. */
export async function getDoubtThread(req: Request, res: Response) {
  const { withId } = doubtThreadQuery.parse(req.query);
  const pair = await resolvePair(req, withId);
  const where = { studentId: pair.studentId, instructorId: pair.instructorId };

  await prisma.doubtMessage.updateMany({ where: { ...where, fromStudent: !pair.fromStudent, readAt: null }, data: { readAt: new Date() } });
  const [other, rows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: withId }, select: { id: true, name: true, email: true, phone: true, bio: true, expertise: true, role: true } }),
    prisma.doubtMessage.findMany({ where, orderBy: { id: 'asc' }, take: 500, select: { id: true, fromStudent: true, body: true, readAt: true, createdAt: true } }),
  ]);
  const messages: DoubtMessageRow[] = rows.map((m) => ({ id: m.id, mine: m.fromStudent === pair.fromStudent, read: m.readAt !== null, body: m.body, createdAt: m.createdAt.toISOString() }));
  const body: DoubtThread = {
    contact: {
      id: other.id,
      name: other.name,
      subtitle: other.role === Role.INSTRUCTOR ? other.expertise : other.email,
      email: other.email,
      phone: other.phone,
      bio: other.bio,
    },
    messages,
  };
  res.json(body);
}

export async function sendDoubtMessage(req: Request, res: Response) {
  const { toId, body } = req.body as SendDoubtInput;
  const pair = await resolvePair(req, toId);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id }, select: { name: true } });
  const where = { studentId: pair.studentId, instructorId: pair.instructorId };

  // One notification per burst: only when the other person has nothing unread from us yet.
  const alreadyUnread = await prisma.doubtMessage.count({ where: { ...where, fromStudent: pair.fromStudent, readAt: null } });
  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.doubtMessage.create({ data: { ...where, fromStudent: pair.fromStudent, body }, select: { id: true, body: true, createdAt: true } });
    if (alreadyUnread === 0) {
      await tx.notification.create({ data: { userId: toId, title: 'New doubt message', body: `${me.name} sent you a message.` } });
    }
    return m;
  });
  const row: DoubtMessageRow = { id: created.id, mine: true, read: false, body: created.body, createdAt: created.createdAt.toISOString() };
  res.status(201).json(row);
}
