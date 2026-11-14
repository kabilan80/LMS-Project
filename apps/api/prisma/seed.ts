import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, PlanType, Role } from '@lms/shared';
import { env } from '../src/config/env';
import { prisma } from '../src/config/prisma';

async function main() {
  // 1. Permissions + default role permissions (ADMIN is implicit; never stored)
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label },
      create: { key: p.key, label: p.label },
    });
  }
  for (const role of [Role.INSTRUCTOR, Role.STUDENT] as const) {
    const allowedKeys: readonly string[] = DEFAULT_ROLE_PERMISSIONS[role];
    for (const p of PERMISSIONS) {
      // update: {} keeps any toggles the admin already made
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey: p.key } },
        update: {},
        create: { role, permissionKey: p.key, allowed: allowedKeys.includes(p.key) },
      });
    }
  }

  // 2. Default plans with placeholder prices (minor units; admin edits later)
  const plans = [
    { type: PlanType.SINGLE, name: 'Single course', priceMinor: 99900 },
    { type: PlanType.ANNUAL, name: 'Annual package', priceMinor: 499900 },
  ];
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { type: plan.type },
      update: {},
      create: { ...plan, currency: env.CURRENCY },
    });
  }

  // 3. The admin is created with `pnpm create-admin` (kept in the database only, never in .env)

  if (env.SEED_DEMO) {
    console.log('SEED_DEMO=true: demo data is added in a later phase.');
  }
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
