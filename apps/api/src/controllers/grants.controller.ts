import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CourseStatus,
  Role,
  grantStudentsQuery,
  listGrantsQuery,
  type CreateGrantInput,
  type GrantRow,
  type GrantStudent,
  type Paginated,
} from '@lms/shared';
import { audit } from '../lib/audit';
import { prisma } from '../config/prisma';
import { badRequest, conflict, forbidden, notFound } from '../middleware/errors';
import { parseId } from './helpers';

export const grantSelect = {
  id: true,
  reason: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  student: { select: { id: true, name: true, email: true } },
  course: { select: { id: true, title: true } },
  grantedBy: { select: { id: true, name: true } },
} satisfies Prisma.AccessGrantSelect;
type GrantRecord = Prisma.AccessGrantGetPayload<{ select: typeof grantSelect }>;

export function toGrantRow(g: GrantRecord, now = new Date()): GrantRow {
  return {
    id: g.id,
    student: g.student,
    course: g.course,
    grantedBy: g.grantedBy,
    reason: g.reason,
    expiresAt: g.expiresAt?.toISOString() ?? null,
    revokedAt: g.revokedAt?.toISOString() ?? null,
    createdAt: g.createdAt.toISOString(),
    active: g.revokedAt === null && (g.expiresAt === null || g.expiresAt > now),
  };
}

const isAdmin = (req: Request) => req.auth!.role === Role.ADMIN;

/** Instructors only work with the students the admin assigned to them. Admin sees everyone. */
const studentScope = (req: Request): Prisma.UserWhereInput =>
  isAdmin(req) ? { role: Role.STUDENT } : { role: Role.STUDENT, instructorId: req.auth!.id };

export async function listGrants(req: Request, res: Response) {
  const q = listGrantsQuery.parse(req.query);
  const now = new Date();
  const activeWhere: Prisma.AccessGrantWhereInput = { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const where: Prisma.AccessGrantWhereInput = {
    student: {
      ...studentScope(req),
      ...(q.search ? { OR: [{ name: { contains: q.search } }, { email: { contains: q.search } }] } : {}),
    },
    ...(q.status === 'active' ? activeWhere : {}),
    ...(q.status === 'inactive' ? { NOT: activeWhere } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.accessGrant.count({ where }),
    prisma.accessGrant.findMany({
      where,
      select: grantSelect,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  const body: Paginated<GrantRow> = {
    items: rows.map((r) => toGrantRow(r, now)),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
  res.json(body);
}

/** Students the caller may grant to (for the picker). Active students only, first 20 matches. */
export async function grantableStudents(req: Request, res: Response) {
  const { search } = grantStudentsQuery.parse(req.query);
  const rows = await prisma.user.findMany({
    where: {
      ...studentScope(req),
      active: true,
      ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] } : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
    take: 20,
  });
  const body: GrantStudent[] = rows;
  res.json(body);
}

export async function createGrant(req: Request, res: Response) {
  const input = req.body as CreateGrantInput;
  const now = new Date();
  if (input.expiresAt && input.expiresAt <= now) {
    throw badRequest('The expiry date must be in the future');
  }

  const student = await prisma.user.findFirst({
    where: { id: input.studentId, role: Role.STUDENT, active: true },
    select: { id: true, name: true, instructorId: true },
  });
  if (!student) throw notFound('Student not found');
  if (!isAdmin(req) && student.instructorId !== req.auth!.id) throw forbidden('This student is not assigned to you');

  const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: { id: true, title: true, status: true } });
  if (!course || course.status !== CourseStatus.PUBLISHED) throw notFound('Course not found');

  const duplicate = await prisma.accessGrant.findFirst({
    where: { studentId: student.id, courseId: course.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true },
  });
  if (duplicate) throw conflict('This student already has an active grant for this course');

  const grant = await prisma.$transaction(async (tx) => {
    const created = await tx.accessGrant.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        grantedById: req.auth!.id,
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
      },
      select: grantSelect,
    });
    await tx.notification.create({
      data: { userId: student.id, title: 'Course access granted', body: `You can now open "${course.title}" for free.` },
    });
    await audit(req.auth!.id, 'grant.create', 'AccessGrant', created.id, tx);
    return created;
  });
  res.status(201).json(toGrantRow(grant, now));
}

export async function revokeGrant(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const grant = await prisma.accessGrant.findUnique({
    where: { id },
    select: { id: true, revokedAt: true, courseId: true, studentId: true, student: { select: { instructorId: true } }, course: { select: { title: true } } },
  });
  if (!grant) throw notFound('Grant not found');
  if (!isAdmin(req) && grant.student.instructorId !== req.auth!.id) throw forbidden('This student is not assigned to you');
  if (grant.revokedAt) throw conflict('This grant was already revoked');

  await prisma.$transaction(async (tx) => {
    await tx.accessGrant.update({ where: { id }, data: { revokedAt: new Date() } });
    await tx.notification.create({
      data: { userId: grant.studentId, title: 'Course access removed', body: `Free access to "${grant.course.title}" has ended.` },
    });
    await audit(req.auth!.id, 'grant.revoke', 'AccessGrant', id, tx);
  });
  res.json({ ok: true });
}
