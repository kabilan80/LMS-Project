import type { Request, Response } from 'express';
import type { PermissionMatrix } from '@lms/shared';
import { audit } from '../lib/audit';
import { prisma } from '../config/prisma';
import { badRequest } from '../middleware/errors';

async function buildMatrix(): Promise<PermissionMatrix> {
  const [permissions, rows] = await Promise.all([
    prisma.permission.findMany({ orderBy: { key: 'asc' } }),
    prisma.rolePermission.findMany(),
  ]);
  const roles: PermissionMatrix['roles'] = { INSTRUCTOR: {}, STUDENT: {} };
  for (const p of permissions) {
    roles.INSTRUCTOR[p.key] = false;
    roles.STUDENT[p.key] = false;
  }
  for (const r of rows) {
    if (r.role === 'INSTRUCTOR' || r.role === 'STUDENT') roles[r.role][r.permissionKey] = r.allowed;
  }
  return { permissions: permissions.map((p) => ({ key: p.key, label: p.label })), roles };
}

export async function getPermissions(_req: Request, res: Response) {
  res.json(await buildMatrix());
}

/** ADMIN always has every permission and is never stored or editable. */
export async function updatePermissions(req: Request, res: Response) {
  const { changes } = req.body as {
    changes: { role: 'INSTRUCTOR' | 'STUDENT'; permissionKey: string; allowed: boolean }[];
  };
  const known = new Set((await prisma.permission.findMany({ select: { key: true } })).map((p) => p.key));
  if (changes.some((c) => !known.has(c.permissionKey))) throw badRequest('Unknown permission');

  await prisma.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.rolePermission.upsert({
        where: { role_permissionKey: { role: c.role, permissionKey: c.permissionKey } },
        update: { allowed: c.allowed },
        create: { role: c.role, permissionKey: c.permissionKey, allowed: c.allowed },
      });
    }
    await audit(req.auth!.id, `permissions.change:${changes.length}`, 'RolePermission', undefined, tx);
  });
  res.json(await buildMatrix());
}
