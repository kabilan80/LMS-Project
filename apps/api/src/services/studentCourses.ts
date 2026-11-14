import { CourseStatus, type MyCourse } from '@lms/shared';
import { prisma } from '../config/prisma';
import { getStudentAccess } from './access';

/** Every course this student can open now, with lesson progress, quiz state and certificate. */
export async function getMyCourses(studentId: number): Promise<MyCourse[]> {
  const access = await getStudentAccess(studentId);
  const courses = await prisma.course.findMany({
    where: {
      status: CourseStatus.PUBLISHED,
      ...(access.annualUntil ? {} : { id: { in: [...access.byCourse.keys()] } }),
    },
    orderBy: { title: 'asc' },
    select: {
      id: true,
      title: true,
      category: true,
      level: true,
      thumbnailUrl: true,
      maxAttempts: true,
      quiz: { select: { id: true, _count: { select: { questions: true } } } },
      modules: {
        orderBy: { order: 'asc' },
        select: { lessons: { orderBy: { order: 'asc' }, select: { id: true } } },
      },
    },
  });

  const allLessonIds = courses.flatMap((c) => c.modules.flatMap((m) => m.lessons.map((l) => l.id)));
  const [done, attempts, certs] = await Promise.all([
    prisma.lessonProgress.findMany({ where: { studentId, completed: true, lessonId: { in: allLessonIds } }, select: { lessonId: true } }),
    prisma.quizAttempt.findMany({ where: { studentId, submittedAt: { not: null } }, select: { id: true, quizId: true, passed: true, scorePercent: true } }),
    prisma.certificate.findMany({ where: { studentId }, select: { id: true, courseId: true } }),
  ]);
  const doneIds = new Set(done.map((d) => d.lessonId));

  return courses.map((c) => {
    const ids = c.modules.flatMap((m) => m.lessons.map((l) => l.id));
    const completedLessons = ids.filter((id) => doneIds.has(id)).length;
    const mine = c.quiz ? attempts.filter((a) => a.quizId === c.quiz?.id) : [];
    return {
      id: c.id,
      title: c.title,
      category: c.category,
      level: c.level,
      thumbnailUrl: c.thumbnailUrl,
      totalLessons: ids.length,
      completedLessons,
      allLessonsDone: ids.length > 0 && completedLessons === ids.length,
      nextLessonId: ids.find((id) => !doneIds.has(id)) ?? null,
      hasQuiz: !!c.quiz && c.quiz._count.questions > 0,
      quizPassed: mine.some((a) => a.passed),
      quizAttemptsUsed: mine.length,
      quizBestPercent: mine.length ? Math.max(...mine.map((a) => a.scorePercent)) : null,
      lastAttemptId: mine.length ? Math.max(...mine.map((a) => a.id)) : null,
      maxAttempts: c.maxAttempts,
      certificateId: certs.find((x) => x.courseId === c.id)?.id ?? null,
    };
  });
}
