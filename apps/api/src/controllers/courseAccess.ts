import type { Request } from 'express';
import type { Course, Prisma } from '@prisma/client';
import { CourseStatus, Role } from '@lms/shared';
import { prisma } from '../config/prisma';
import { forbidden, notFound } from '../middleware/errors';

export const isAdmin = (req: Request) => req.auth?.role === Role.ADMIN;
export const isStaff = (req: Request) => req.auth?.role === Role.ADMIN || req.auth?.role === Role.INSTRUCTOR;

/** Finds a course by id. Admins and instructors may open and edit any course in any status; students are refused. */
export async function getStaffCourse(req: Request, courseId: number): Promise<Course> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw notFound('Course not found');
  if (!isStaff(req)) throw forbidden();
  return course;
}

/**
 * Call inside the same transaction as any content change.
 * Editing a PUBLISHED course keeps it live (students never lose a course by accident).
 * Editing a REJECTED course turns it back into a DRAFT.
 */
export async function markCourseEdited(tx: Prisma.TransactionClient, course: Course): Promise<void> {
  if (course.status === CourseStatus.REJECTED) {
    await tx.course.update({ where: { id: course.id }, data: { status: CourseStatus.DRAFT } });
  } else {
    await tx.course.update({ where: { id: course.id }, data: { updatedAt: new Date() } });
  }
}

export async function getModuleCourseId(moduleId: number): Promise<number> {
  const m = await prisma.courseModule.findUnique({ where: { id: moduleId }, select: { courseId: true } });
  if (!m) throw notFound('Module not found');
  return m.courseId;
}

export async function getLessonCourseIds(lessonId: number): Promise<{ courseId: number; moduleId: number }> {
  const l = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { moduleId: true, module: { select: { courseId: true } } },
  });
  if (!l) throw notFound('Lesson not found');
  return { courseId: l.module.courseId, moduleId: l.moduleId };
}
