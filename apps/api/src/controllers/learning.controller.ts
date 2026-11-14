import type { Request, Response } from 'express';
import {
  CourseStatus,
  effectivePassMark,
  Role,
  paginationQuery,
  type LearnState,
  type LessonPlayback,
  type MyStudentRow,
  type Paginated,
  type ProgressInput,
  type ProgressResult,
} from '@lms/shared';
import { prisma } from '../config/prisma';
import { forbidden, notFound } from '../middleware/errors';
import { getCourseAccess, getStudentAccess } from '../services/access';
import { getAssignmentProgress } from '../services/certificates';
import { getMyCourses } from '../services/studentCourses';
import { closeOldAttempts, getLessons, isLessonDone } from '../services/learning';
import { parseId } from './helpers';

/** The course must be published and the student must have access (purchase, bundle, annual or grant). */
async function checkCourseAccess(studentId: number, courseId: number) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      status: true,
      passMark: true,
      maxAttempts: true,
      quiz: { select: { id: true, title: true, timeLimitMinutes: true, _count: { select: { questions: true } } } },
    },
  });
  if (!course || course.status !== CourseStatus.PUBLISHED) throw notFound('Course not found');
  if (!(await getCourseAccess(studentId, courseId))) throw forbidden('You do not have access to this course');
  return course;
}

export async function getLearnState(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const courseId = parseId(req.params['id']);
  const course = await checkCourseAccess(studentId, courseId);
  const lessons = await getLessons(courseId, studentId);
  const allCompleted = lessons.length > 0 && lessons.every((l) => l.completed);

  let attemptsUsed = 0;
  let passed = false;
  let openAttemptId: number | null = null;
  let certificateId: number | null = null;
  const assignmentProgress = await getAssignmentProgress(studentId, courseId);
  if (course.quiz) {
    await closeOldAttempts(studentId, course.quiz.id, course.quiz.timeLimitMinutes);
    const attempts = await prisma.quizAttempt.findMany({
      where: { studentId, quizId: course.quiz.id },
      select: { id: true, passed: true, submittedAt: true, startedAt: true },
    });
    attemptsUsed = attempts.filter((a) => a.submittedAt !== null).length;
    passed = attempts.some((a) => a.passed);
    openAttemptId = attempts.find((a) => a.submittedAt === null)?.id ?? null;
    certificateId = (await prisma.certificate.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { id: true } }))?.id ?? null;
  }

  const body: LearnState = {
    course: { id: course.id, title: course.title, passMark: effectivePassMark(course.passMark), maxAttempts: course.maxAttempts },
    lessons: lessons.map((l) => ({
      id: l.id,
      title: l.title,
      moduleTitle: l.moduleTitle,
      number: l.number,
      durationSeconds: l.durationSeconds,
      completed: l.completed,
      locked: l.locked,
      isPreview: l.isPreview,
    })),
    allCompleted,
    quiz: {
      exists: !!course.quiz && course.quiz._count.questions > 0,
      title: course.quiz?.title ?? null,
      questionCount: course.quiz?._count.questions ?? 0,
      timeLimitMinutes: course.quiz?.timeLimitMinutes ?? null,
      attemptsUsed,
      passed,
      certificateId,
      openAttemptId,
      assignmentsPending: assignmentProgress.pending,
      assignmentsBelowMin: assignmentProgress.belowMin,
    },
  };
  res.json(body);
}

/** Video IDs leave the server only here: for students with access, or for a free preview lesson. */
export async function getLesson(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const lessonId = parseId(req.params['id']);
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      youtubeId: true,
      durationSeconds: true,
      isPreview: true,
      module: { select: { courseId: true, course: { select: { status: true, title: true } } } },
    },
  });
  if (!lesson || lesson.module.course.status !== CourseStatus.PUBLISHED) throw notFound('Lesson not found');
  const courseId = lesson.module.courseId;
  const hasAccess = !!(await getCourseAccess(studentId, courseId));
  if (!hasAccess && !lesson.isPreview) throw forbidden('Get access to this course to watch this lesson');

  let lastPositionSeconds = 0;
  let completed = false;
  let nextLessonId: number | null = null;
  if (hasAccess) {
    const ordered = await getLessons(courseId, studentId);
    const index = ordered.findIndex((l) => l.id === lessonId);
    if (index === -1) throw notFound('Lesson not found');
    if (ordered[index]?.locked) throw forbidden('Finish the previous lesson first');
    completed = ordered[index]?.completed ?? false;
    nextLessonId = ordered[index + 1]?.id ?? null;
    const progress = await prisma.lessonProgress.findUnique({
      where: { studentId_lessonId: { studentId, lessonId } },
      select: { lastPositionSeconds: true },
    });
    lastPositionSeconds = progress?.lastPositionSeconds ?? 0;
  }

  const body: LessonPlayback = {
    id: lesson.id,
    title: lesson.title,
    courseId,
    courseTitle: lesson.module.course.title,
    youtubeId: lesson.youtubeId,
    lastPositionSeconds,
    completed,
    durationSeconds: lesson.durationSeconds,
    previewOnly: !hasAccess,
    nextLessonId,
  };
  res.json(body);
}

/**
 * Saves position and watched time, and marks the lesson complete (90% or ended).
 * v1 trusts the numbers the browser reports; see ASSUMPTIONS.md.
 */
export async function saveProgress(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const lessonId = parseId(req.params['id']);
  const input = req.body as ProgressInput;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, durationSeconds: true, isPreview: true, module: { select: { courseId: true, course: { select: { status: true } } } } },
  });
  if (!lesson || lesson.module.course.status !== CourseStatus.PUBLISHED) throw notFound('Lesson not found');
  const courseId = lesson.module.courseId;

  if (!(await getCourseAccess(studentId, courseId))) {
    if (!lesson.isPreview) throw forbidden('You do not have access to this course');
    const noop: ProgressResult = { completed: false, allCompleted: false, nextLessonId: null, saved: false };
    res.json(noop); // free previews are not tracked
    return;
  }

  const ordered = await getLessons(courseId, studentId);
  const index = ordered.findIndex((l) => l.id === lessonId);
  const current = ordered[index];
  if (!current) throw notFound('Lesson not found');
  if (current.locked) throw forbidden('Finish the previous lesson first');

  const duration = lesson.durationSeconds ?? input.durationSeconds ?? null;
  const watchedCap = duration ? Math.min(input.watchedSeconds, duration) : input.watchedSeconds;
  const nowComplete = isLessonDone(watchedCap, duration, input.ended === true);

  const existing = await prisma.lessonProgress.findUnique({ where: { studentId_lessonId: { studentId, lessonId } } });
  const completed = (existing?.completed ?? false) || nowComplete;
  await prisma.lessonProgress.upsert({
    where: { studentId_lessonId: { studentId, lessonId } },
    create: {
      studentId,
      lessonId,
      lastPositionSeconds: input.ended ? 0 : input.positionSeconds,
      watchedSeconds: watchedCap,
      completed,
      completedAt: completed ? new Date() : null,
    },
    update: {
      lastPositionSeconds: input.ended ? 0 : input.positionSeconds,
      watchedSeconds: Math.max(existing?.watchedSeconds ?? 0, watchedCap),
      completed,
      ...(completed && !existing?.completed ? { completedAt: new Date() } : {}),
    },
  });

  const allCompleted = ordered.every((l) => (l.id === lessonId ? completed : l.completed));
  const body: ProgressResult = { completed, allCompleted, nextLessonId: ordered[index + 1]?.id ?? null, saved: true };
  res.json(body);
}

/** Every course the student can open now, with progress. Used by the dashboard, My lessons and Quizzes. */
export async function listMyCourses(req: Request, res: Response) {
  res.json({ items: await getMyCourses(req.auth!.id) });
}

/** Instructor: the students assigned to them, with a little progress context. */
export async function listMyStudents(req: Request, res: Response) {
  const q = paginationQuery.parse(req.query);
  const search = typeof req.query['search'] === 'string' ? req.query['search'].trim() : '';
  const where = {
    role: Role.STUDENT,
    instructorId: req.auth!.id,
    ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] } : {}),
  };
  const [total, students] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, name: true, email: true, active: true, createdAt: true, _count: { select: { certificates: true } } },
    }),
  ]);
  const ids = students.map((s) => s.id);
  const now = new Date();
  const [lessons, grants] = await Promise.all([
    prisma.lessonProgress.groupBy({ by: ['studentId'], where: { studentId: { in: ids }, completed: true }, _count: { _all: true } }),
    prisma.accessGrant.groupBy({
      by: ['studentId'],
      where: { studentId: { in: ids }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      _count: { _all: true },
    }),
  ]);
  const accessList = await Promise.all(students.map((s) => getStudentAccess(s.id)));
  const selected = [...new Set(accessList.flatMap((a) => [...a.byCourse.keys()]))];
  const titles = new Map(
    (await prisma.course.findMany({ where: { id: { in: selected } }, select: { id: true, title: true } })).map((c) => [c.id, c.title] as const),
  );
  const body: Paginated<MyStudentRow> = {
    items: students.map((s, i) => ({
      courses: [...accessList[i]!.byCourse.entries()]
        .filter(([id]) => titles.has(id))
        .map(([id, source]) => ({ id, title: titles.get(id)!, source }))
        .sort((a, z) => a.title.localeCompare(z.title)),
      annualUntil: accessList[i]!.annualUntil?.toISOString() ?? null,
      id: s.id,
      name: s.name,
      email: s.email,
      active: s.active,
      createdAt: s.createdAt.toISOString(),
      lessonsCompleted: lessons.find((l) => l.studentId === s.id)?._count._all ?? 0,
      certificates: s._count.certificates,
      activeGrants: grants.find((g) => g.studentId === s.id)?._count._all ?? 0,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
  res.json(body);
}

// Shared with the quiz controller, which needs the same access gate.
export { checkCourseAccess };
