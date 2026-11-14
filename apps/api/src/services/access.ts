import type { Prisma } from '@prisma/client';
import { AccessSource, PurchaseStatus, PurchaseType } from '@lms/shared';
import { prisma } from '../config/prisma';

/**
 * One place that answers "can this student open this course, and why?".
 * Phase 6 (lessons, quizzes) calls the same functions, so the catalog and the player never disagree.
 *
 * Sources, in the order they are reported when more than one applies:
 *  SINGLE  - an ACTIVE single-course purchase (lifetime)
 *  BUNDLE  - an ACTIVE bundle purchase that includes the course (lifetime)
 *  GRANT   - a grant from an instructor/admin that is not revoked and not expired
 *  ANNUAL  - an ACTIVE annual package whose endsAt is still in the future (every course)
 */
export interface StudentAccess {
  annualUntil: Date | null;
  /** Courses unlocked individually (single, bundle or grant). Annual is separate because it covers everything. */
  byCourse: Map<number, Exclude<AccessSource, 'ANNUAL'>>;
}

export interface PurchaseFact {
  type: PurchaseType;
  courseId: number | null;
  endsAt: Date | null;
  bundleCourseIds: number[];
}
export interface GrantFact {
  courseId: number;
}

/** Pure: no database. The caller has already filtered to ACTIVE purchases and live grants. */
export function resolveAccess(purchases: PurchaseFact[], grants: GrantFact[]): StudentAccess {
  const byCourse = new Map<number, Exclude<AccessSource, 'ANNUAL'>>();
  const put = (courseId: number, source: Exclude<AccessSource, 'ANNUAL'>) => {
    if (!byCourse.has(courseId)) byCourse.set(courseId, source);
  };
  for (const p of purchases) if (p.type === PurchaseType.SINGLE && p.courseId !== null) put(p.courseId, AccessSource.SINGLE);
  for (const p of purchases) if (p.type === PurchaseType.BUNDLE) for (const id of p.bundleCourseIds) put(id, AccessSource.BUNDLE);
  for (const g of grants) put(g.courseId, AccessSource.GRANT);

  let annualUntil: Date | null = null;
  for (const p of purchases) {
    if (p.type === PurchaseType.ANNUAL && p.endsAt && (!annualUntil || p.endsAt > annualUntil)) annualUntil = p.endsAt;
  }
  return { annualUntil, byCourse };
}

export function accessSourceFor(access: StudentAccess, courseId: number): AccessSource | null {
  return access.byCourse.get(courseId) ?? (access.annualUntil ? AccessSource.ANNUAL : null);
}

type Db = Pick<Prisma.TransactionClient, 'purchase' | 'accessGrant'>;

export async function getStudentAccess(studentId: number, db: Db = prisma, now = new Date()): Promise<StudentAccess> {
  const [purchases, grants] = await Promise.all([
    db.purchase.findMany({
      where: {
        studentId,
        status: PurchaseStatus.ACTIVE,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: {
        type: true,
        courseId: true,
        endsAt: true,
        bundle: { select: { courses: { select: { courseId: true } } } },
      },
    }),
    db.accessGrant.findMany({
      where: { studentId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { courseId: true },
    }),
  ]);
  return resolveAccess(
    purchases.map((p) => ({
      type: p.type,
      courseId: p.courseId,
      endsAt: p.endsAt,
      bundleCourseIds: p.bundle?.courses.map((c) => c.courseId) ?? [],
    })),
    grants,
  );
}

/** Why the student can open this course right now, or null. Does not check the course is published. */
export async function getCourseAccess(studentId: number, courseId: number): Promise<AccessSource | null> {
  return accessSourceFor(await getStudentAccess(studentId), courseId);
}

/** Marks overdue ACTIVE purchases EXPIRED. Reads already ignore them; this keeps the stored status honest. */
export async function expireOverduePurchases(studentId?: number, now = new Date()): Promise<void> {
  await prisma.purchase.updateMany({
    where: {
      status: PurchaseStatus.ACTIVE,
      endsAt: { lte: now },
      ...(studentId === undefined ? {} : { studentId }),
    },
    data: { status: PurchaseStatus.EXPIRED },
  });
}
