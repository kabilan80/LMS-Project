import { prisma } from '../config/prisma';
import { getStudentAccess } from './access';

export interface TeachingInfo {
  /** courseId -> number of assigned students who selected it (single, bundle or grant). */
  byCourse: Map<number, number>;
  /** Assigned students with a live annual package: they can open every published course. */
  annualStudents: number;
}

/** What the instructor teaches = the courses their admin-assigned students selected. */
export async function getTeaching(instructorId: number): Promise<TeachingInfo> {
  const students = await prisma.user.findMany({ where: { instructorId, role: 'STUDENT' }, select: { id: true } });
  const byCourse = new Map<number, number>();
  let annualStudents = 0;
  for (const s of students) {
    const a = await getStudentAccess(s.id);
    if (a.annualUntil) annualStudents++;
    for (const id of a.byCourse.keys()) byCourse.set(id, (byCourse.get(id) ?? 0) + 1);
  }
  return { byCourse, annualStudents };
}
