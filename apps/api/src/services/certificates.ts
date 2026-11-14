import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { AssignmentStatus, CERTIFICATE_MIN_PERCENT, summarizeAttempts, type CertificateProgress, type ProgressState } from '@lms/shared';
import { prisma } from '../config/prisma';
import { log } from '../lib/log';
import { getMyCourses } from './studentCourses';

type Db = Pick<Prisma.TransactionClient, 'courseAssignment' | 'assignment' | 'quizAttempt' | 'certificate' | 'notification' | 'course'>;

const newCertificateCode = () => {
  const hex = randomBytes(5).toString('hex').toUpperCase();
  return `LH-${hex.slice(0, 5)}-${hex.slice(5)}`;
};

export interface AssignmentProgress {
  /** Assignments the instructor/admin set for the course. */
  required: number;
  /** How many of them have an ACCEPTED submission from this student. */
  accepted: number;
  /** Not accepted yet and the student can still get there (waiting for review, or attempts left). */
  pending: number;
  /** Used every attempt without passing: this student can no longer finish the assignment. */
  failed: number;
  /** Average marks over the accepted submissions (0 when none). */
  averagePercent: number;
  /** No certificate is possible from the assignments: an assignment was failed on every attempt, or all are accepted but the average marks are under the 70% a certificate needs. */
  belowMin: boolean;
}

/**
 * A course assignment is done once the instructor has ACCEPTED one of the student's submissions for it
 * (marks at or above the pass mark). The assignment score is the average of those marks; a course with no assignments has none.
 * One that was submitted the maximum number of times without passing is "failed" (same rule as a used-up quiz).
 */
export async function getAssignmentProgress(studentId: number, courseId: number, db: Db = prisma): Promise<AssignmentProgress> {
  const tasks = await db.courseAssignment.findMany({ where: { courseId }, select: { id: true } });
  if (tasks.length === 0) return { required: 0, accepted: 0, pending: 0, failed: 0, averagePercent: 0, belowMin: false };
  const [course, rows] = await Promise.all([
    db.course.findUnique({ where: { id: courseId }, select: { maxAttempts: true } }),
    db.assignment.findMany({
      where: { studentId, courseAssignmentId: { in: tasks.map((t) => t.id) } },
      select: { courseAssignmentId: true, status: true, marks: true },
    }),
  ]);
  const maxAttempts = course?.maxAttempts ?? 3;
  const doneMarks: number[] = [];
  let failed = 0;
  for (const t of tasks) {
    const mine = rows.filter((r) => r.courseAssignmentId === t.id);
    const best = mine.filter((r) => r.status === AssignmentStatus.ACCEPTED).sort((x, y) => (y.marks ?? 0) - (x.marks ?? 0))[0];
    if (best) doneMarks.push(best.marks ?? 0);
    else if (summarizeAttempts(mine.map((r) => r.status), maxAttempts).exhausted) failed++;
  }
  const pending = tasks.length - doneMarks.length - failed;
  const averagePercent = doneMarks.length === 0 ? 0 : Math.round(doneMarks.reduce((sum, m) => sum + m, 0) / doneMarks.length);
  return {
    required: tasks.length,
    accepted: doneMarks.length,
    pending,
    failed,
    averagePercent,
    belowMin: failed > 0 || (pending === 0 && averagePercent < CERTIFICATE_MIN_PERCENT),
  };
}

/**
 * The ONE place a certificate is issued. It needs both:
 *   1. a passed quiz attempt scoring 70% or more, and
 *   2. an accepted submission for every assignment of the course with average marks of 70 or more
 *      (courses with no assignments need only the quiz).
 * Below 70% in either one: no certificate.
 * Safe to call any time (after a quiz, after an assignment is accepted, after an assignment is removed):
 * it does nothing unless the student is now eligible, and never issues a second certificate.
 */
export async function issueCertificateIfEligible(studentId: number, courseId: number, db: Db = prisma): Promise<{ issued: boolean; reason?: string }> {
  const existing = await db.certificate.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { id: true } });
  if (existing) return { issued: false, reason: 'already issued' };

  const best = await db.quizAttempt.findFirst({
    where: { studentId, passed: true, scorePercent: { gte: CERTIFICATE_MIN_PERCENT }, quiz: { courseId } },
    orderBy: { scorePercent: 'desc' },
    select: { scorePercent: true },
  });
  if (!best) {
    log('certificate', `student ${studentId} course ${courseId}: not issued, no quiz attempt with ${CERTIFICATE_MIN_PERCENT}% or more yet`);
    return { issued: false, reason: 'quiz not passed' };
  }

  const progress = await getAssignmentProgress(studentId, courseId, db);
  if (progress.belowMin) {
    log('certificate', `student ${studentId} course ${courseId}: not issued, assignments failed or marks below ${CERTIFICATE_MIN_PERCENT}%`, progress);
    return { issued: false, reason: 'assignments below minimum' };
  }
  if (progress.pending > 0) {
    log('certificate', `student ${studentId} course ${courseId}: not issued, waiting for assignment approval`, progress);
    return { issued: false, reason: 'assignments not approved' };
  }

  const course = await db.course.findUnique({ where: { id: courseId }, select: { title: true } });
  await db.certificate.create({ data: { code: newCertificateCode(), studentId, courseId, scorePercent: best.scorePercent } });
  await db.notification.create({
    data: {
      userId: studentId,
      title: 'Certificate issued',
      body: `You completed "${course?.title ?? 'the course'}". Your certificate is ready.`,
    },
  });
  log('certificate', `student ${studentId} course ${courseId}: certificate ISSUED`, { score: best.scorePercent, ...progress });
  return { issued: true };
}

/** After an assignment is removed from a course: students who were only waiting for it can now get their certificate. */
export async function issueWaitingCertificates(courseId: number): Promise<void> {
  const passed = await prisma.quizAttempt.findMany({ where: { passed: true, scorePercent: { gte: CERTIFICATE_MIN_PERCENT }, quiz: { courseId } }, select: { studentId: true }, distinct: ['studentId'] });
  for (const { studentId } of passed) await issueCertificateIfEligible(studentId, courseId);
}

/**
 * The checklist behind the student's Certificates page: for every course they can open, are the lessons done,
 * is the quiz passed with 70%+, and are the assignments accepted with an average of 70+.
 */
export async function getCertificateProgress(studentId: number): Promise<CertificateProgress[]> {
  const [courses, certs] = await Promise.all([
    getMyCourses(studentId),
    prisma.certificate.findMany({ where: { studentId }, select: { id: true, courseId: true, code: true } }),
  ]);
  return Promise.all(
    courses.map(async (c): Promise<CertificateProgress> => {
      const cert = certs.find((x) => x.courseId === c.id) ?? null;
      const ap = await getAssignmentProgress(studentId, c.id);

      const lessons: ProgressState = c.allLessonsDone ? 'done' : 'pending';
      const quizOk = c.quizBestPercent !== null && c.quizBestPercent >= CERTIFICATE_MIN_PERCENT && c.quizPassed;
      const quiz: ProgressState = quizOk ? 'done' : c.hasQuiz && c.quizAttemptsUsed >= c.maxAttempts ? 'failed' : 'pending';
      const assignments: ProgressState = ap.required === 0 ? 'na' : ap.belowMin ? 'failed' : ap.pending > 0 ? 'pending' : 'done';

      const states = [lessons, quiz, assignments];
      return {
        courseId: c.id,
        courseTitle: c.title,
        status: cert ? 'ACCOMPLISHED' : states.includes('failed') ? 'NOT_ELIGIBLE' : 'IN_PROGRESS',
        certificateId: cert?.id ?? null,
        certificateCode: cert?.code ?? null,
        lessons: { done: c.completedLessons, total: c.totalLessons, state: lessons },
        quiz: { exists: c.hasQuiz, bestPercent: c.quizBestPercent, attemptsUsed: c.quizAttemptsUsed, maxAttempts: c.maxAttempts, state: quiz },
        assignments: { required: ap.required, accepted: ap.accepted, averagePercent: ap.accepted > 0 ? ap.averagePercent : null, state: assignments },
        stepsDone: states.filter((x) => x === 'done' || x === 'na').length,
      };
    }),
  );
}
