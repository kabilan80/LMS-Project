import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CourseStatus,
  Role,
  courseListQuery,
  type CourseDetail,
  type CourseInput,
  type CourseListItem,
  type Paginated,
  type UpdateCourseInput,
} from '@lms/shared';
import { audit } from '../lib/audit';
import { prisma } from '../config/prisma';
import { badRequest, notFound } from '../middleware/errors';
import { accessSourceFor, getStudentAccess, type StudentAccess } from '../services/access';
import { getTeaching, type TeachingInfo } from '../services/teaching';
import { markCourseEdited, getStaffCourse } from './courseAccess';
import { parseId } from './helpers';

const listSelect = {
  id: true,
  title: true,
  slug: true,
  category: true,
  level: true,
  status: true,
  thumbnailUrl: true,
  rejectionReason: true,
  submittedAt: true,
  updatedAt: true,
  creator: { select: { id: true, name: true } },
  modules: { select: { _count: { select: { lessons: true } } } },
} satisfies Prisma.CourseSelect;

type ListRecord = Prisma.CourseGetPayload<{ select: typeof listSelect }>;

function toListItem(c: ListRecord, access?: StudentAccess, teaching?: TeachingInfo): CourseListItem {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    category: c.category,
    level: c.level,
    status: c.status,
    thumbnailUrl: c.thumbnailUrl,
    rejectionReason: c.rejectionReason,
    creator: c.creator,
    moduleCount: c.modules.length,
    lessonCount: c.modules.reduce((n, m) => n + m._count.lessons, 0),
    submittedAt: c.submittedAt?.toISOString() ?? null,
    updatedAt: c.updatedAt.toISOString(),
    ...(access ? { access: accessSourceFor(access, c.id) } : {}),
    ...(teaching ? { myStudents: (teaching.byCourse.get(c.id) ?? 0) + (c.status === CourseStatus.PUBLISHED ? teaching.annualStudents : 0) } : {}),
  };
}

const slugify = (t: string) =>
  t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'course';

/** Students: PUBLISHED only, each with how they can open it. Instructors and admin: every course. */
export async function listCourses(req: Request, res: Response) {
  const q = courseListQuery.parse(req.query);
  const auth = req.auth!;
  const teaching = auth.role === Role.INSTRUCTOR ? await getTeaching(auth.id) : undefined;
  const teachingScope = auth.role === Role.INSTRUCTOR && q.scope === 'teaching';
  const where: Prisma.CourseWhereInput = {
    ...(teachingScope && teaching
      ? { status: CourseStatus.PUBLISHED, ...(teaching.annualStudents > 0 ? {} : { id: { in: [...teaching.byCourse.keys()] } }) }
      : {}),
    ...(q.search ? { title: { contains: q.search } } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.level ? { level: q.level } : {}),
    ...(auth.role === Role.STUDENT
      ? { status: CourseStatus.PUBLISHED }
      : {
          ...(q.status && !teachingScope ? { status: q.status } : {}),
        }),
  };
  const student = auth.role === Role.STUDENT;
  const orderBy: Prisma.CourseOrderByWithRelationInput[] =
    q.sort === 'title' ? [{ title: 'asc' }] : student ? [{ approvedAt: 'desc' }, { id: 'desc' }] : [{ updatedAt: 'desc' }];
  const [total, rows, access] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      select: listSelect,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    student ? getStudentAccess(auth.id) : Promise.resolve(undefined),
  ]);
  const body: Paginated<CourseListItem> = {
    items: rows.map((r) => toListItem(r, access, teaching)),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
  res.json(body);
}

/** Categories of published courses, for the catalog filter chips. */
export async function listCategories(_req: Request, res: Response) {
  const rows = await prisma.course.findMany({
    where: { status: CourseStatus.PUBLISHED },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });
  res.json(rows.map((r) => r.category));
}

export async function getCourse(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const auth = req.auth!;
  const c = await prisma.course.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true } },
      modules: { orderBy: { order: 'asc' }, include: { lessons: { orderBy: { order: 'asc' } } } },
      courseAssignments: { orderBy: { order: 'asc' } },
      quiz: {
        include: {
          questions: { orderBy: { order: 'asc' }, include: { options: { orderBy: { id: 'asc' } } } },
        },
      },
    },
  });
  if (!c) throw notFound('Course not found');

  const editor = auth.role === Role.ADMIN || auth.role === Role.INSTRUCTOR;
  if (auth.role === Role.STUDENT && c.status !== CourseStatus.PUBLISHED) throw notFound('Course not found');

  const studentAccess = auth.role === Role.STUDENT ? await getStudentAccess(auth.id) : undefined;

  const body: CourseDetail = {
    id: c.id,
    title: c.title,
    slug: c.slug,
    category: c.category,
    level: c.level,
    status: c.status,
    thumbnailUrl: c.thumbnailUrl,
    rejectionReason: c.rejectionReason,
    creator: c.creator,
    description: c.description,
    passMark: c.passMark,
    maxAttempts: c.maxAttempts,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    approvedAt: c.approvedAt?.toISOString() ?? null,
    updatedAt: c.updatedAt.toISOString(),
    canEdit: editor,
    ...(studentAccess ? { access: accessSourceFor(studentAccess, c.id) } : {}),
    modules: c.modules.map((m) => ({
      id: m.id,
      title: m.title,
      order: m.order,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        order: l.order,
        durationSeconds: l.durationSeconds,
        isPreview: l.isPreview,
        notes: l.notes,
        // Video IDs are only for editors here; students get them from the lesson endpoint after an access check.
        ...(editor ? { youtubeUrl: l.youtubeUrl, youtubeId: l.youtubeId } : {}),
      })),
    })),
    assignments: c.courseAssignments.map((a) => ({ id: a.id, title: a.title, description: a.description, order: a.order })),
    quiz: c.quiz
      ? {
          id: c.quiz.id,
          title: c.quiz.title,
          timeLimitMinutes: c.quiz.timeLimitMinutes,
          questions: c.quiz.questions.map((q) => ({
            id: q.id,
            text: q.text,
            order: q.order,
            explanation: editor ? q.explanation : null,
            options: q.options.map((o) => ({ id: o.id, text: o.text, ...(editor ? { isCorrect: o.isCorrect } : {}) })),
          })),
        }
      : null,
  };
  res.json(body);
}

/** Every new course starts as DRAFT, whoever creates it. */
export async function createCourse(req: Request, res: Response) {
  const input = req.body as CourseInput;
  const course = await prisma.course.create({
    data: {
      ...input,
      thumbnailUrl: input.thumbnailUrl ?? null,
      slug: `${slugify(input.title)}-${randomBytes(3).toString('hex')}`,
      creatorId: req.auth!.id,
      status: CourseStatus.DRAFT,
    },
    select: { id: true },
  });
  res.status(201).json({ id: course.id });
}

export async function updateCourse(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const input = req.body as UpdateCourseInput;
  const course = await getStaffCourse(req, id);
  await prisma.$transaction(async (tx) => {
    await tx.course.update({ where: { id }, data: input });
    await markCourseEdited(tx, course);
  });
  res.json({ ok: true });
}

/** A course needs at least one lesson and a final quiz with a question before it can go for review or live. */
async function assertCourseReady(courseId: number, verb: string): Promise<void> {
  const [lessons, quiz] = await Promise.all([
    prisma.lesson.count({ where: { module: { courseId } } }),
    prisma.quiz.findUnique({ where: { courseId }, select: { _count: { select: { questions: true } } } }),
  ]);
  const problems: string[] = [];
  if (lessons === 0) problems.push('add at least one lesson');
  if (!quiz || quiz._count.questions === 0) problems.push('add a final quiz with at least one question');
  if (problems.length > 0) throw badRequest(`Before ${verb}, ${problems.join(' and ')}.`);
}

/** Admin only: publishes straight away. Instructors use submitCourse and wait for approval. */
export async function publishCourse(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const course = await getStaffCourse(req, id);
  if (course.status === CourseStatus.PUBLISHED) throw badRequest('This course is already published');
  await assertCourseReady(id, 'publishing');

  await prisma.$transaction(async (tx) => {
    await tx.course.update({
      where: { id },
      data: { status: CourseStatus.PUBLISHED, approvedById: req.auth!.id, approvedAt: new Date(), rejectionReason: null },
    });
    if (course.creatorId !== req.auth!.id) {
      await tx.notification.create({
        data: { userId: course.creatorId, title: 'Course published', body: `"${course.title}" is now published.` },
      });
    }
    await audit(req.auth!.id, 'course.publish', 'Course', id, tx);
  });
  res.json({ ok: true });
}

export async function submitCourse(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const course = await getStaffCourse(req, id);
  if (course.status !== CourseStatus.DRAFT && course.status !== CourseStatus.REJECTED) {
    throw badRequest('Only draft or rejected courses can be submitted');
  }
  await assertCourseReady(id, 'submitting');

  await prisma.$transaction(async (tx) => {
    await tx.course.update({
      where: { id },
      data: { status: CourseStatus.PENDING, submittedAt: new Date(), rejectionReason: null },
    });
    const admins = await tx.user.findMany({ where: { role: Role.ADMIN }, select: { id: true } });
    await tx.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: 'Course submitted for approval',
        body: `"${course.title}" is waiting for review.`,
      })),
    });
    await audit(req.auth!.id, 'course.submit', 'Course', id, tx);
  });
  res.json({ ok: true });
}

export async function approveCourse(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) throw notFound('Course not found');
  if (course.status !== CourseStatus.PENDING) throw badRequest('Only courses waiting for approval can be approved');

  await prisma.$transaction(async (tx) => {
    await tx.course.update({
      where: { id },
      data: {
        status: CourseStatus.PUBLISHED,
        approvedById: req.auth!.id,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    });
    await tx.notification.create({
      data: { userId: course.creatorId, title: 'Course approved', body: `"${course.title}" is now published.` },
    });
    await audit(req.auth!.id, 'course.approve', 'Course', id, tx);
  });
  res.json({ ok: true });
}

export async function rejectCourse(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const { reason } = req.body as { reason: string };
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) throw notFound('Course not found');
  if (course.status !== CourseStatus.PENDING) throw badRequest('Only courses waiting for approval can be rejected');

  await prisma.$transaction(async (tx) => {
    await tx.course.update({ where: { id }, data: { status: CourseStatus.REJECTED, rejectionReason: reason } });
    await tx.notification.create({
      data: { userId: course.creatorId, title: 'Course needs changes', body: `"${course.title}": ${reason}` },
    });
    await audit(req.auth!.id, 'course.reject', 'Course', id, tx);
  });
  res.json({ ok: true });
}

/** Choice documented in ASSUMPTIONS.md: unpublishing returns the course to DRAFT. Admin and instructors can do it. */
export async function unpublishCourse(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const course = await prisma.course.findUnique({ where: { id } });
  if (!course) throw notFound('Course not found');
  if (course.status !== CourseStatus.PUBLISHED) throw badRequest('Only published courses can be unpublished');

  await prisma.$transaction(async (tx) => {
    await tx.course.update({
      where: { id },
      data: { status: CourseStatus.DRAFT, approvedAt: null, approvedById: null },
    });
    await audit(req.auth!.id, 'course.unpublish', 'Course', id, tx);
  });
  res.json({ ok: true });
}
