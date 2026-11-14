import type { Request, Response } from 'express';
import {
  CourseStatus,
  PaymentStatus,
  PurchaseStatus,
  PurchaseType,
  Role,
  type AdminDashboard,
  type InstructorCourseStat,
  type InstructorDashboard,
  type StudentDashboard,
} from '@lms/shared';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { getStudentAccess } from '../services/access';
import { getMyCourses } from '../services/studentCourses';
import { purchaseSelect, toPurchaseRow } from './plans.controller';

const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

// ---------------------------------------------------------------- student
export async function getStudentDashboard(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const [access, courses, certificates, lastTouched] = await Promise.all([
    getStudentAccess(studentId),
    getMyCourses(studentId),
    prisma.certificate.count({ where: { studentId } }),
    // The lesson the student touched most recently decides what "continue learning" shows.
    prisma.lessonProgress.findFirst({
      where: { studentId },
      orderBy: { updatedAt: 'desc' },
      select: { lesson: { select: { module: { select: { courseId: true } } } } },
    }),
  ]);

  const lastCourseId = lastTouched?.lesson.module.courseId;
  const resumable = courses.filter((c) => c.nextLessonId !== null);
  const pick = resumable.find((c) => c.id === lastCourseId) ?? resumable.find((c) => c.completedLessons > 0) ?? resumable[0];
  const nextLesson = pick?.nextLessonId
    ? await prisma.lesson.findUnique({ where: { id: pick.nextLessonId }, select: { id: true, title: true } })
    : null;
  const quizCourse = courses.find((c) => c.hasQuiz && c.allLessonsDone && !c.quizPassed && c.quizAttemptsUsed < c.maxAttempts);

  const body: StudentDashboard = {
    plan: {
      annualUntil: access.annualUntil?.toISOString() ?? null,
      individualCourses: access.byCourse.size,
      accessibleCourses: courses.length,
    },
    continueLearning:
      pick && nextLesson
        ? {
            courseId: pick.id,
            courseTitle: pick.title,
            lessonId: nextLesson.id,
            lessonTitle: nextLesson.title,
            completedLessons: pick.completedLessons,
            totalLessons: pick.totalLessons,
          }
        : null,
    upcomingQuiz: quizCourse
      ? { courseId: quizCourse.id, courseTitle: quizCourse.title, attemptsLeft: quizCourse.maxAttempts - quizCourse.quizAttemptsUsed }
      : null,
    courses,
    certificates,
  };
  res.json(body);
}

// ------------------------------------------------------------- instructor
export async function getInstructorDashboard(req: Request, res: Response) {
  const me = req.auth!.id;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [courses, assignedStudents] = await Promise.all([
    prisma.course.findMany({
      where: { creatorId: me },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        quiz: { select: { id: true } },
        modules: { select: { lessons: { select: { id: true } } } },
      },
    }),
    prisma.user.count({ where: { role: Role.STUDENT, instructorId: me } }),
  ]);

  const lessonToCourse = new Map<number, number>();
  const lessonsPerCourse = new Map<number, number>();
  for (const c of courses) {
    const ids = c.modules.flatMap((m) => m.lessons.map((l) => l.id));
    lessonsPerCourse.set(c.id, ids.length);
    for (const id of ids) lessonToCourse.set(id, c.id);
  }
  const quizIds = courses.flatMap((c) => (c.quiz ? [c.quiz.id] : []));

  const [progress, quizAvg, certs, certCount, newLearners] = await Promise.all([
    prisma.lessonProgress.findMany({
      where: { lessonId: { in: [...lessonToCourse.keys()] } },
      select: { studentId: true, lessonId: true, completed: true },
    }),
    prisma.quizAttempt.groupBy({
      by: ['quizId'],
      where: { quizId: { in: quizIds }, submittedAt: { not: null } },
      _avg: { scorePercent: true },
    }),
    prisma.certificate.findMany({
      where: { courseId: { in: courses.map((c) => c.id) } },
      orderBy: { issuedAt: 'desc' },
      take: 6,
      select: { id: true, issuedAt: true, student: { select: { name: true } }, course: { select: { title: true } } },
    }),
    prisma.certificate.count({ where: { courseId: { in: courses.map((c) => c.id) } } }),
    prisma.lessonProgress.findMany({
      where: { lessonId: { in: [...lessonToCourse.keys()] }, updatedAt: { gte: weekAgo } },
      distinct: ['studentId'],
      select: { studentId: true },
    }),
  ]);

  // Learners = students with any progress in my courses. Completion = finished lessons / (learners x lessons).
  const learnersByCourse = new Map<number, Set<number>>();
  const doneByCourse = new Map<number, number>();
  for (const p of progress) {
    const courseId = lessonToCourse.get(p.lessonId);
    if (courseId === undefined) continue;
    if (!learnersByCourse.has(courseId)) learnersByCourse.set(courseId, new Set());
    learnersByCourse.get(courseId)?.add(p.studentId);
    if (p.completed) doneByCourse.set(courseId, (doneByCourse.get(courseId) ?? 0) + 1);
  }
  const allLearners = new Set(progress.map((p) => p.studentId));

  const stats: InstructorCourseStat[] = courses.map((c) => {
    const learners = learnersByCourse.get(c.id)?.size ?? 0;
    const quizRow = c.quiz ? quizAvg.find((q) => q.quizId === c.quiz?.id) : undefined;
    const avg = quizRow?._avg.scorePercent;
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      learners,
      completionPercent: pct(doneByCourse.get(c.id) ?? 0, learners * (lessonsPerCourse.get(c.id) ?? 0)),
      avgQuizPercent: avg === null || avg === undefined ? null : Math.round(avg),
    };
  });
  const withCompletion = stats.filter((s) => s.completionPercent !== null);
  const avgCompletionPercent = withCompletion.length
    ? Math.round(withCompletion.reduce((n, s) => n + (s.completionPercent ?? 0), 0) / withCompletion.length)
    : null;

  const count = (status: CourseStatus) => courses.filter((c) => c.status === status).length;
  const activity: InstructorDashboard['activity'] = [
    ...certs.map((c) => ({
      id: `cert-${c.id}`,
      text: `${c.student.name} earned a certificate in ${c.course.title}`,
      at: c.issuedAt.toISOString(),
    })),
  ];
  if (newLearners.length > 0) {
    activity.unshift({ id: 'learners-week', text: `${newLearners.length} learner(s) were active in your courses this week`, at: new Date().toISOString() });
  }
  for (const c of courses.filter((x) => x.status === CourseStatus.PENDING)) {
    activity.unshift({ id: `pending-${c.id}`, text: `${c.title} is waiting for admin approval`, at: new Date().toISOString() });
  }

  const body: InstructorDashboard = {
    courses: {
      total: courses.length,
      draft: count(CourseStatus.DRAFT),
      pending: count(CourseStatus.PENDING),
      published: count(CourseStatus.PUBLISHED),
      rejected: count(CourseStatus.REJECTED),
    },
    learners: allLearners.size,
    avgCompletionPercent,
    assignedStudents,
    certificatesIssued: certCount,
    stats,
    activity,
  };
  res.json(body);
}

// ------------------------------------------------------------------ admin
export async function getAdminDashboard(_req: Request, res: Response) {
  const now = new Date();
  const live = { status: PurchaseStatus.ACTIVE, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
  const [students, instructors, unassigned, published, pending, activeAnnual, activeBundles, activeSingles, revenue, pendingCourses, recent] =
    await Promise.all([
      prisma.user.count({ where: { role: Role.STUDENT } }),
      prisma.user.count({ where: { role: Role.INSTRUCTOR, active: true } }),
      prisma.user.count({ where: { role: Role.STUDENT, active: true, instructorId: null } }),
      prisma.course.count({ where: { status: CourseStatus.PUBLISHED } }),
      prisma.course.count({ where: { status: CourseStatus.PENDING } }),
      prisma.purchase.count({ where: { ...live, type: PurchaseType.ANNUAL } }),
      prisma.purchase.count({ where: { ...live, type: PurchaseType.BUNDLE } }),
      prisma.purchase.count({ where: { ...live, type: PurchaseType.SINGLE } }),
      prisma.payment.aggregate({ _sum: { amountMinor: true }, where: { status: PaymentStatus.SUCCEEDED } }),
      prisma.course.findMany({
        where: { status: CourseStatus.PENDING },
        orderBy: { submittedAt: 'asc' },
        take: 5,
        select: { id: true, title: true, submittedAt: true, creator: { select: { name: true } } },
      }),
      prisma.purchase.findMany({
        where: { status: { in: [PurchaseStatus.ACTIVE, PurchaseStatus.EXPIRED, PurchaseStatus.REFUNDED] } },
        select: purchaseSelect,
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

  const body: AdminDashboard = {
    users: { students, instructors, unassignedStudents: unassigned },
    courses: { published, pending },
    sales: { currency: env.CURRENCY, activeAnnual, activeBundles, activeSingles, revenueMinor: revenue._sum.amountMinor ?? 0 },
    pendingCourses: pendingCourses.map((c) => ({
      id: c.id,
      title: c.title,
      creatorName: c.creator.name,
      submittedAt: c.submittedAt?.toISOString() ?? null,
    })),
    recentPurchases: recent.map((p) => toPurchaseRow(p, true)),
  };
  res.json(body);
}
