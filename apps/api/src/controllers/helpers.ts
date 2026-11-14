import type { Prisma } from '@prisma/client';
import type { UserRow } from '@lms/shared';
import { Role } from '@lms/shared';
import { prisma } from '../config/prisma';
import { badRequest } from '../middleware/errors';

/** The main admin is the oldest ADMIN row (the first one created with `pnpm create-admin`). Other admins are created in the app. */
export async function primaryAdminId(): Promise<number | null> {
  const row = await prisma.user.findFirst({ where: { role: Role.ADMIN }, orderBy: { id: 'asc' }, select: { id: true } });
  return row?.id ?? null;
}

export function parseId(value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Invalid id');
  return n;
}

export const userRowSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  mustChangePassword: true,
  phone: true,
  expertise: true,
  instructorId: true,
  createdAt: true,
  instructor: { select: { name: true } },
  _count: { select: { students: true } },
} satisfies Prisma.UserSelect;

type UserRowRecord = Prisma.UserGetPayload<{ select: typeof userRowSelect }>;

/** Never includes passwordHash. */
export function toUserRow(u: UserRowRecord, locked = false): UserRow {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    phone: u.phone,
    expertise: u.expertise,
    instructorId: u.instructorId,
    instructorName: u.instructor?.name ?? null,
    studentCount: u._count.students,
    locked,
    createdAt: u.createdAt.toISOString(),
  };
}
