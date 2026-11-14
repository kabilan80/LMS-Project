import type { Request, Response } from 'express';
import { CourseStatus, MAX_HOME_COURSES, Role, type HomeCourse, type HomeCourseOption, type HomePageData } from '@lms/shared';
import { audit } from '../lib/audit';
import { prisma } from '../config/prisma';
import { badRequest, notFound } from '../middleware/errors';
import { parseId } from './helpers';

const short = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

/** Public (no sign-in): what the landing page shows. Only published courses the admin chose are included. */
export async function getPublicHome(_req: Request, res: Response) {
  const [courses, students, certificates, publishedCount, plans] = await Promise.all([
    prisma.course.findMany({
      where: { status: CourseStatus.PUBLISHED, showOnHome: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_HOME_COURSES,
      select: {
        id: true, title: true, category: true, level: true, description: true, thumbnailUrl: true,
        creator: { select: { name: true } },
        modules: { select: { _count: { select: { lessons: true } } } },
      },
    }),
    prisma.user.count({ where: { role: Role.STUDENT, active: true } }),
    prisma.certificate.count(),
    prisma.course.count({ where: { status: CourseStatus.PUBLISHED } }),
    prisma.plan.findMany({ where: { active: true }, orderBy: { id: 'asc' } }),
  ]);
  const body: HomePageData = {
    stats: { courses: publishedCount, students, certificates },
    courses: courses.map((c): HomeCourse => ({
      id: c.id,
      title: c.title,
      category: c.category,
      level: c.level,
      description: short(c.description),
      thumbnailUrl: c.thumbnailUrl,
      lessonCount: c.modules.reduce((n, m) => n + m._count.lessons, 0),
      teacherName: c.creator.name,
    })),
    plans: plans.map((p) => ({ id: p.id, type: p.type, name: p.name, priceMinor: p.priceMinor, currency: p.currency, active: p.active })),
  };
  res.set('Cache-Control', 'public, max-age=60');
  res.json(body);
}

/** Admin: every published course with its on/off switch for the home page. */
export async function listHomeCourses(_req: Request, res: Response) {
  const rows = await prisma.course.findMany({
    where: { status: CourseStatus.PUBLISHED },
    orderBy: { title: 'asc' },
    select: { id: true, title: true, category: true, level: true, showOnHome: true, creator: { select: { name: true } } },
  });
  const items: HomeCourseOption[] = rows.map((c) => ({
    id: c.id, title: c.title, category: c.category, level: c.level, teacherName: c.creator.name, showOnHome: c.showOnHome,
  }));
  res.json({ items, max: MAX_HOME_COURSES });
}

/** Admin: show or hide one course on the home page (at most MAX_HOME_COURSES at a time). */
export async function setHomeCourseShown(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const { show } = req.body as { show: boolean };
  const course = await prisma.course.findFirst({ where: { id, status: CourseStatus.PUBLISHED }, select: { id: true, showOnHome: true } });
  if (!course) throw notFound('Published course not found');
  if (show && !course.showOnHome) {
    const shown = await prisma.course.count({ where: { status: CourseStatus.PUBLISHED, showOnHome: true } });
    if (shown >= MAX_HOME_COURSES) throw badRequest(`You can show at most ${MAX_HOME_COURSES} courses on the home page. Hide one first.`);
  }
  await prisma.$transaction(async (tx) => {
    await tx.course.update({ where: { id }, data: { showOnHome: show } });
    await audit(req.auth!.id, show ? 'home.show-course' : 'home.hide-course', 'Course', id, tx);
  });
  res.json({ ok: true });
}
