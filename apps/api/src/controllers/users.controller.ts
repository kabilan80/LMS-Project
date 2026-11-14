import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  Role,
  listUsersQuery,
  type CreateUserInput,
  type CreatedUser,
  type Paginated,
  type UpdateUserInput,
  type UserRow,
} from '@lms/shared';
import { audit } from '../lib/audit';
import { log } from '../lib/log';
import { BCRYPT_ROUNDS } from '../lib/admin';
import { generateTempPassword } from '../lib/password';
import { prisma } from '../config/prisma';
import { conflict, forbidden, notFound } from '../middleware/errors';
import { parseId, primaryAdminId, toUserRow, userRowSelect } from './helpers';

async function findUsers(
  query: unknown,
  force: Partial<{ role: 'STUDENT'; unassigned: 'true' }> = {},
  selfId?: number,
): Promise<Paginated<UserRow>> {
  const q = { ...listUsersQuery.parse(query), ...force };
  const where: Prisma.UserWhereInput = {
    role: q.role ?? { in: [Role.ADMIN, Role.INSTRUCTOR, Role.STUDENT] },
    ...(q.active ? { active: q.active === 'true' } : {}),
    ...(q.unassigned === 'true' ? { role: Role.STUDENT, instructorId: null } : {}),
    ...(q.unassigned === 'false' ? { role: Role.STUDENT, instructorId: { not: null } } : {}),
    ...(q.instructorId ? { role: Role.STUDENT, instructorId: q.instructorId } : {}),
    ...(q.search ? { OR: [{ name: { contains: q.search } }, { email: { contains: q.search } }] } : {}),
  };
  const [total, rows, mainAdmin] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: userRowSelect,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    primaryAdminId(),
  ]);
  const isLocked = (r: { id: number; role: Role }) => r.role === Role.ADMIN && (r.id === mainAdmin || r.id === selfId);
  return { items: rows.map((r) => toUserRow(r, isLocked(r))), page: q.page, pageSize: q.pageSize, total };
}

export async function listUsers(req: Request, res: Response) {
  res.json(await findUsers(req.query, {}, req.auth!.id));
}

/** Creates an admin, an instructor or a student with a generated temporary password (shown once, changed at first login). */
export async function createUser(req: Request, res: Response) {
  const input = req.body as CreateUserInput;
  const isInstructor = input.role === Role.INSTRUCTOR;
  log('users', `admin ${req.auth!.id} creates a ${input.role}`, { name: input.name, email: input.email });
  const temporaryPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          expertise: isInstructor ? (input.expertise ?? null) : null,
          passwordHash,
          role: input.role,
          mustChangePassword: true,
        },
        select: userRowSelect,
      });
      await audit(req.auth!.id, `${input.role.toLowerCase()}.create`, 'User', created.id, tx);
      log('users', `created ${input.role} user ${created.id}`);
      return created;
    });
    const body: CreatedUser = { user: toUserRow(user), temporaryPassword };
    res.status(201).json(body);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw conflict('An account with this email already exists');
    }
    throw e;
  }
}

/** Admins can manage other admins, but never themselves and never the main admin (the first admin created). */
async function guardAdminTarget(req: Request, targetId: number) {
  if (targetId === req.auth!.id) throw forbidden('You cannot change your own account here');
  if (targetId === (await primaryAdminId())) throw forbidden('The main admin account cannot be changed here');
}

export async function updateUser(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const input = req.body as UpdateUserInput;
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) throw notFound('User not found');
  if (target.role === Role.ADMIN) await guardAdminTarget(req, id);

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data: input, select: userRowSelect });
    if (input.active !== undefined) {
      await audit(req.auth!.id, input.active ? 'user.enable' : 'user.disable', 'User', id, tx);
    }
    return updated;
  });
  res.json({ user: toUserRow(user) });
}

/** New temporary password; the user must change it at next login. Shown once to the admin. */
export async function resetUserPassword(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) throw notFound('User not found');
  if (target.role === Role.ADMIN) await guardAdminTarget(req, id);

  const temporaryPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
    await audit(req.auth!.id, 'user.reset-password', 'User', id, tx);
  });
  res.json({ temporaryPassword });
}
