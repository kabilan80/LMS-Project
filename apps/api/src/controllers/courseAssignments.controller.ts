import type { Request, Response } from 'express';
import { AssignmentStatus, effectivePassMark, summarizeAttempts, type AssignmentTask, type CourseAssignmentInput } from '@lms/shared';
import { prisma } from '../config/prisma';
import { log } from '../lib/log';
import { badRequest, notFound } from '../middleware/errors';
import { getMyCourses } from '../services/studentCourses';
import { issueWaitingCertificates } from '../services/certificates';
import { getStaffCourse, markCourseEdited } from './courseAccess';
import { parseId } from './helpers';

/**
 * Assignments that the instructor/admin adds to a course in the course builder (they work like modules).
 * Same rules as the rest of the builder: admins and instructors can edit, and editing keeps a live course live.
 */

const sameSet = (a: number[], b: number[]) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

async function getTaskCourseId(id: number): Promise<number> {
  const t = await prisma.courseAssignment.findUnique({ where: { id }, select: { courseId: true } });
  if (!t) throw notFound('Assignment not found');
  return t.courseId;
}

export async function createCourseAssignment(req: Request, res: Response) {
  const courseId = parseId(req.params['id']);
  const input = req.body as CourseAssignmentInput;
  const course = await getStaffCourse(req, courseId);
  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.courseAssignment.aggregate({ where: { courseId }, _max: { order: true } });
    const a = await tx.courseAssignment.create({
      data: { courseId, title: input.title, description: input.description || null, order: (last._max.order ?? 0) + 1 },
    });
    await markCourseEdited(tx, course);
    return a;
  });
  log('course-assignment', `created assignment ${created.id} for course ${courseId}`, { title: input.title });
  res.status(201).json({ id: created.id });
}

export async function updateCourseAssignment(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const input = req.body as CourseAssignmentInput;
  const course = await getStaffCourse(req, await getTaskCourseId(id));
  await prisma.$transaction(async (tx) => {
    await tx.courseAssignment.update({ where: { id }, data: { title: input.title, description: input.description || null } });
    await markCourseEdited(tx, course);
  });
  log('course-assignment', `updated assignment ${id}`, { title: input.title });
  res.json({ ok: true });
}

export async function deleteCourseAssignment(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const courseId = await getTaskCourseId(id);
  const course = await getStaffCourse(req, courseId);
  await prisma.$transaction(async (tx) => {
    await tx.courseAssignment.delete({ where: { id } }); // student submissions are kept (their link is cleared)
    await markCourseEdited(tx, course);
  });
  log('course-assignment', `deleted assignment ${id} from course ${courseId}`);
  // Students who were only waiting for this one can get their certificate now.
  await issueWaitingCertificates(courseId);
  res.json({ ok: true });
}

export async function reorderCourseAssignments(req: Request, res: Response) {
  const courseId = parseId(req.params['id']);
  const { orderedIds } = req.body as { orderedIds: number[] };
  const course = await getStaffCourse(req, courseId);
  const existing = (await prisma.courseAssignment.findMany({ where: { courseId }, select: { id: true } })).map((a) => a.id);
  if (!sameSet(orderedIds, existing)) throw badRequest('The list must contain every assignment exactly once');
  await prisma.$transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) await tx.courseAssignment.update({ where: { id }, data: { order: i + 1 } });
    await markCourseEdited(tx, course);
  });
  log('course-assignment', `reordered assignments of course ${courseId}`, orderedIds);
  res.json({ ok: true });
}

/** Student: the assignments of every course they can open, with where their own submission stands. */
export async function listMyAssignmentTasks(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const courses = await getMyCourses(studentId);
  const tasks = await prisma.courseAssignment.findMany({
    where: { courseId: { in: courses.map((c) => c.id) } },
    orderBy: [{ courseId: 'asc' }, { order: 'asc' }],
    select: { id: true, courseId: true, title: true, description: true },
  });
  const [mine, limits] = await Promise.all([
    prisma.assignment.findMany({
      where: { studentId, courseAssignmentId: { in: tasks.map((t) => t.id) } },
      orderBy: { createdAt: 'desc' },
      select: { courseAssignmentId: true, status: true },
    }),
    prisma.course.findMany({ where: { id: { in: courses.map((c) => c.id) } }, select: { id: true, passMark: true } }),
  ]);
  const rank: Record<string, number> = { [AssignmentStatus.ACCEPTED]: 3, [AssignmentStatus.VERIFYING]: 2, [AssignmentStatus.SUBMITTED]: 1, [AssignmentStatus.REJECTED]: 0 };
  const items: AssignmentTask[] = tasks.map((t) => {
    // The best state wins (an accepted one beats an older rejected one); among equals the newest is first anyway.
    const states = mine.filter((m) => m.courseAssignmentId === t.id).map((m) => m.status);
    const myStatus = states.length ? states.reduce((a, b) => ((rank[b] ?? 0) > (rank[a] ?? 0) ? b : a)) : null;
    const course = courses.find((c) => c.id === t.courseId);
    const maxAttempts = course?.maxAttempts ?? 3;
    // Same attempt rules as the quiz: the course attempt limit, and no more submissions once passed.
    const attempts = summarizeAttempts(states, maxAttempts);
    return {
      id: t.id, courseId: t.courseId, courseTitle: course?.title ?? '', title: t.title, description: t.description, myStatus,
      attemptsUsed: attempts.used, maxAttempts, attemptsLeft: attempts.left,
      passMark: effectivePassMark(limits.find((l) => l.id === t.courseId)?.passMark ?? 0),
      canSubmit: attempts.canSubmit, blockedReason: attempts.blockedReason,
    };
  });
  log('course-assignment', `student ${studentId} can see ${items.length} assignment(s)`);
  res.json({ items });
}
