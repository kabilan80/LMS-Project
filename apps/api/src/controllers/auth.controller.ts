import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import {
  Role,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
  type LoginResponse,
  type RegisterInput,
} from '@lms/shared';
import { BCRYPT_ROUNDS } from '../lib/admin';
import { log } from '../lib/log';
import { signToken } from '../lib/jwt';
import { prisma } from '../config/prisma';
import { conflict, notFound, unauthorized, badRequest } from '../middleware/errors';

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);
const GENERIC_LOGIN_ERROR = 'Incorrect email or password';

const toAuthUser = (u: {
  id: number;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
}): AuthUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  mustChangePassword: u.mustChangePassword,
});

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as LoginInput;
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    log('auth', `login FAILED for ${email}`);
    throw unauthorized(GENERIC_LOGIN_ERROR);
  }
  log('auth', `login OK for ${email}`, { id: user.id, role: user.role });

  const body: LoginResponse = { token: signToken(user.id, user.role), user: toAuthUser(user) };
  res.json(body);
}

/** Students only. The role is fixed here; nothing in the request body can choose it. */
export async function register(req: Request, res: Response) {
  const { name, email, password } = req.body as RegisterInput;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: Role.STUDENT },
    });
    const body: LoginResponse = { token: signToken(user.id, user.role), user: toAuthUser(user) };
    res.status(201).json(body);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw conflict('An account with this email already exists');
    }
    throw e;
  }
}

export async function getCurrentUser(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.auth!.id } });
  if (!user) throw notFound('User not found');
  res.json({ user: toAuthUser(user) });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;
  const user = await prisma.user.findUnique({ where: { id: req.auth!.id } });
  if (!user) throw notFound('User not found');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw badRequest('Current password is incorrect');
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS), mustChangePassword: false },
  });
  const body: LoginResponse = { token: signToken(updated.id, updated.role), user: toAuthUser(updated) };
  res.json(body);
}
