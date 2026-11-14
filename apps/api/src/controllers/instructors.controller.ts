import type { Request, Response } from 'express';
import { Role, type InstructorRow } from '@lms/shared';
import { audit } from '../lib/audit';
import { prisma } from '../config/prisma';
import { badRequest, notFound } from '../middleware/errors';
import { parseId } from './helpers';

async function requireActiveInstructor(id: number) {
  const instructor = await prisma.user.findFirst({
    where: { id, role: Role.INSTRUCTOR, active: true },
    select: { id: true },
  });
  if (!instructor) throw badRequest('Choose an active instructor');
}

/** Assign, change or clear (null) a student's instructor. */
export async function assignStudentToInstructor(req: Request, res: Response) {
  const studentId = parseId(req.params['id']);
  const { instructorId } = req.body as { instructorId: number | null };
  const student = await prisma.user.findFirst({ where: { id: studentId, role: Role.STUDENT } });
  if (!student) throw notFound('Student not found');
  if (instructorId !== null) await requireActiveInstructor(instructorId);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: studentId }, data: { instructorId } });
    if (instructorId !== null && instructorId !== student.instructorId) {
      await tx.notification.createMany({
        data: [
          { userId: studentId, title: 'Instructor assigned', body: 'You have been assigned an instructor. Open Doubts to ask them anything.' },
          { userId: instructorId, title: 'New student assigned', body: `${student.name} was assigned to you.` },
        ],
      });
    }
    await audit(req.auth!.id, 'student.assign-instructor', 'User', studentId, tx);
  });
  res.json({ ok: true });
}

export async function assignStudentsToInstructor(req: Request, res: Response) {
  const { studentIds, instructorId } = req.body as { studentIds: number[]; instructorId: number };
  await requireActiveInstructor(instructorId);

  const count = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id: { in: studentIds }, role: Role.STUDENT },
      data: { instructorId },
    });
    if (result.count > 0) {
      await tx.notification.create({
        data: { userId: instructorId, title: 'New students assigned', body: `${result.count} student(s) were assigned to you.` },
      });
    }
    await audit(req.auth!.id, `student.assign-bulk:${result.count}`, 'User', instructorId, tx);
    return result.count;
  });
  res.json({ assigned: count });
}

export async function listInstructors(_req: Request, res: Response) {
  const rows = await prisma.user.findMany({
    where: { role: Role.INSTRUCTOR },
    select: { id: true, name: true, expertise: true, active: true, _count: { select: { students: true } } },
    orderBy: { name: 'asc' },
  });
  const items: InstructorRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    expertise: r.expertise,
    active: r.active,
    studentCount: r._count.students,
  }));
  res.json({ items });
}
