import type { Request, Response } from 'express';
import { parseYouTubeId, type LessonInput, type UpdateLessonInput } from '@lms/shared';
import { prisma } from '../config/prisma';
import { badRequest } from '../middleware/errors';
import { markCourseEdited, getLessonCourseIds, getModuleCourseId, getStaffCourse } from './courseAccess';
import { parseId } from './helpers';

const sameSet = (a: number[], b: number[]) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

// ---------- modules ----------
export async function createModule(req: Request, res: Response) {
  const courseId = parseId(req.params['id']);
  const { title } = req.body as { title: string };
  const course = await getStaffCourse(req, courseId);
  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.courseModule.aggregate({ where: { courseId }, _max: { order: true } });
    const m = await tx.courseModule.create({ data: { courseId, title, order: (last._max.order ?? 0) + 1 } });
    await markCourseEdited(tx, course);
    return m;
  });
  res.status(201).json({ id: created.id });
}

export async function updateModule(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const { title } = req.body as { title: string };
  const course = await getStaffCourse(req, await getModuleCourseId(id));
  await prisma.$transaction(async (tx) => {
    await tx.courseModule.update({ where: { id }, data: { title } });
    await markCourseEdited(tx, course);
  });
  res.json({ ok: true });
}

export async function deleteModule(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const course = await getStaffCourse(req, await getModuleCourseId(id));
  await prisma.$transaction(async (tx) => {
    await tx.courseModule.delete({ where: { id } }); // lessons cascade
    await markCourseEdited(tx, course);
  });
  res.json({ ok: true });
}

export async function reorderModules(req: Request, res: Response) {
  const courseId = parseId(req.params['id']);
  const { orderedIds } = req.body as { orderedIds: number[] };
  const course = await getStaffCourse(req, courseId);
  const existing = (await prisma.courseModule.findMany({ where: { courseId }, select: { id: true } })).map((m) => m.id);
  if (!sameSet(orderedIds, existing)) throw badRequest('The list must contain every module exactly once');
  await prisma.$transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) await tx.courseModule.update({ where: { id }, data: { order: i + 1 } });
    await markCourseEdited(tx, course);
  });
  res.json({ ok: true });
}

// ---------- lessons ----------
export async function createLesson(req: Request, res: Response) {
  const moduleId = parseId(req.params['id']);
  const input = req.body as LessonInput;
  const youtubeId = parseYouTubeId(input.youtubeUrl);
  if (!youtubeId) throw badRequest('Enter a valid YouTube link');
  const course = await getStaffCourse(req, await getModuleCourseId(moduleId));
  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.lesson.aggregate({ where: { moduleId }, _max: { order: true } });
    const l = await tx.lesson.create({
      data: {
        moduleId,
        title: input.title,
        youtubeUrl: input.youtubeUrl,
        youtubeId,
        durationSeconds: input.durationSeconds ?? null,
        isPreview: input.isPreview,
        notes: input.notes ?? null,
        order: (last._max.order ?? 0) + 1,
      },
    });
    await markCourseEdited(tx, course);
    return l;
  });
  res.status(201).json({ id: created.id });
}

export async function updateLesson(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const input = req.body as UpdateLessonInput;
  const { courseId } = await getLessonCourseIds(id);
  const course = await getStaffCourse(req, courseId);

  let youtubeId: string | undefined;
  if (input.youtubeUrl !== undefined) {
    const parsed = parseYouTubeId(input.youtubeUrl);
    if (!parsed) throw badRequest('Enter a valid YouTube link');
    youtubeId = parsed;
  }
  await prisma.$transaction(async (tx) => {
    await tx.lesson.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.youtubeUrl !== undefined ? { youtubeUrl: input.youtubeUrl, youtubeId: youtubeId ?? '' } : {}),
        ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
        ...(input.isPreview !== undefined ? { isPreview: input.isPreview } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    await markCourseEdited(tx, course);
  });
  res.json({ ok: true });
}

export async function deleteLesson(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const { courseId } = await getLessonCourseIds(id);
  const course = await getStaffCourse(req, courseId);
  await prisma.$transaction(async (tx) => {
    await tx.lesson.delete({ where: { id } });
    await markCourseEdited(tx, course);
  });
  res.json({ ok: true });
}

export async function reorderLessons(req: Request, res: Response) {
  const moduleId = parseId(req.params['id']);
  const { orderedIds } = req.body as { orderedIds: number[] };
  const course = await getStaffCourse(req, await getModuleCourseId(moduleId));
  const existing = (await prisma.lesson.findMany({ where: { moduleId }, select: { id: true } })).map((l) => l.id);
  if (!sameSet(orderedIds, existing)) throw badRequest('The list must contain every lesson exactly once');
  await prisma.$transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) await tx.lesson.update({ where: { id }, data: { order: i + 1 } });
    await markCourseEdited(tx, course);
  });
  res.json({ ok: true });
}
