import bcrypt from 'bcryptjs';
import { Role } from '@lms/shared';
import { prisma } from '../config/prisma';

export const BCRYPT_ROUNDS = 12;

export async function adminExists(): Promise<boolean> {
  return (await prisma.user.count({ where: { role: Role.ADMIN } })) > 0;
}

/**
 * Creates (or, if the email already belongs to an admin, updates) an admin directly in the database.
 * Credentials are never read from .env: run `pnpm create-admin` (prompts for them) instead.
 * Only the bcrypt hash of the password is stored.
 */
export async function createAdmin(input: { name: string; email: string; password: string }): Promise<'created' | 'updated'> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) throw new Error('Name is required');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address');
  if (input.password.length < 8) throw new Error('Password must be at least 8 characters');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== Role.ADMIN) throw new Error(`${email} is already used by a non-admin account`);

  const data = { name, email, passwordHash, active: true, mustChangePassword: false };
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data });
    return 'updated';
  }
  await prisma.user.create({ data: { ...data, role: Role.ADMIN } });
  return 'created';
}
