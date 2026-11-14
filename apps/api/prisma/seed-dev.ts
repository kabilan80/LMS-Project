import bcrypt from 'bcryptjs';
import { DEV_LOGINS, Role } from '@lms/shared';
import { prisma } from '../src/config/prisma';
import { BCRYPT_ROUNDS } from '../src/lib/admin';

/**
 * DEVELOPMENT ONLY: creates (or resets) the three test accounts used by the quick-login buttons.
 *   pnpm seed:dev      (run from apps/api)
 * The student is assigned to the instructor so assignments and doubts work straight away.
 */
async function upsertUser(role: Role, extra: { expertise?: string; instructorId?: number } = {}) {
  const d = DEV_LOGINS[role];
  const passwordHash = await bcrypt.hash(d.password, BCRYPT_ROUNDS);
  const data = { name: d.name, passwordHash, role, active: true, mustChangePassword: false, ...extra };
  const user = await prisma.user.upsert({ where: { email: d.email }, update: data, create: { email: d.email, ...data } });
  console.log(`[seed:dev] ${role.padEnd(10)} ${d.email}  (id ${user.id})`);
  return user;
}

async function main() {
  if (process.env['NODE_ENV'] === 'production') throw new Error('seed:dev is for development only');
  await upsertUser(Role.ADMIN);
  const instructor = await upsertUser(Role.INSTRUCTOR, { expertise: 'Web development' });
  await upsertUser(Role.STUDENT, { instructorId: instructor.id });
  console.log(`[seed:dev] done. Password for all three: ${DEV_LOGINS.ADMIN.password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
