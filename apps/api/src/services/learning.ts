import type { Prisma } from '@prisma/client';
import { LESSON_COMPLETE_THRESHOLD, QUIZ_GRACE_SECONDS } from '@lms/shared';
import { prisma } from '../config/prisma';

/** PURE: a lesson counts as complete when the video ended, or at least 90% of it was watched. */
export function isLessonDone(watchedSeconds: number, durationSeconds: number | null, ended: boolean): boolean {
  if (ended) return true;
  return !!durationSeconds && durationSeconds > 0 && watchedSeconds / durationSeconds >= LESSON_COMPLETE_THRESHOLD;
}

/** PURE: lessons unlock in order. A lesson is locked while any lesson before it is not complete. */
export function addLocks<T extends { completed: boolean }>(lessons: T[]): (T & { locked: boolean })[] {
  let blocked = false;
  return lessons.map((l) => {
    const out = { ...l, locked: blocked };
    if (!l.completed) blocked = true;
    return out;
  });
}

/** PURE: when an attempt must be submitted by. */
export const quizDeadline = (startedAt: Date, timeLimitMinutes: number) =>
  new Date(startedAt.getTime() + timeLimitMinutes * 60_000);

/** PURE: past the deadline plus the grace period, answers no longer count. */
export const isLate = (deadline: Date, now: Date) => now.getTime() > deadline.getTime() + QUIZ_GRACE_SECONDS * 1000;

export interface OrderedLesson {
  id: number;
  title: string;
  moduleTitle: string;
  number: number;
  durationSeconds: number | null;
  isPreview: boolean;
  completed: boolean;
  locked: boolean;
}

type Db = Pick<Prisma.TransactionClient, 'lesson' | 'lessonProgress'>;

/** All lessons of a course in learning order, with this student's completion and lock state. */
export async function getLessons(courseId: number, studentId: number, db: Db = prisma): Promise<OrderedLesson[]> {
  const lessons = await db.lesson.findMany({
    where: { module: { courseId } },
    orderBy: [{ module: { order: 'asc' } }, { order: 'asc' }],
    select: { id: true, title: true, durationSeconds: true, isPreview: true, module: { select: { title: true } } },
  });
  const done = await db.lessonProgress.findMany({
    where: { studentId, completed: true, lessonId: { in: lessons.map((l) => l.id) } },
    select: { lessonId: true },
  });
  const doneIds = new Set(done.map((d) => d.lessonId));
  return addLocks(
    lessons.map((l, i) => ({
      id: l.id,
      title: l.title,
      moduleTitle: l.module.title,
      number: i + 1,
      durationSeconds: l.durationSeconds,
      isPreview: l.isPreview,
      completed: doneIds.has(l.id),
    })),
  );
}

/** Attempts that were started but never submitted in time are closed as failed, so they use up an attempt. */
export async function closeOldAttempts(studentId: number, quizId: number, timeLimitMinutes: number, now = new Date()) {
  const open = await prisma.quizAttempt.findMany({ where: { studentId, quizId, submittedAt: null }, select: { id: true, startedAt: true } });
  const expired = open.filter((a) => isLate(quizDeadline(a.startedAt, timeLimitMinutes), now)).map((a) => a.id);
  if (expired.length > 0) {
    await prisma.quizAttempt.updateMany({ where: { id: { in: expired } }, data: { submittedAt: now, scorePercent: 0, passed: false } });
  }
}
