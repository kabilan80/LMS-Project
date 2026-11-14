import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CourseStatus,
  PaymentStatus,
  PlanType,
  PurchaseStatus,
  PurchaseType,
  Role,
  listBundlesQuery,
  paginationQuery,
  type BundleInput,
  type BundleItem,
  type CourseOption,
  type Paginated,
  type PlanItem,
  type PurchaseRow,
  type SalesSummary,
  type UpdateBundleInput,
  type UpdatePlanInput,
} from '@lms/shared';
import { audit } from '../lib/audit';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { badRequest, notFound } from '../middleware/errors';
import { accessSourceFor, getStudentAccess } from '../services/access';
import { parseId } from './helpers';

const isStudent = (req: Request) => req.auth!.role === Role.STUDENT;

// ---- Plans ----

function toPlanItem(p: { id: number; type: PlanType; name: string; priceMinor: number; currency: string; active: boolean }): PlanItem {
  return { id: p.id, type: p.type, name: p.name, priceMinor: p.priceMinor, currency: p.currency, active: p.active };
}

const DEFAULT_PLANS = [
  { type: PlanType.SINGLE, name: 'Single course', priceMinor: 99900 },
  { type: PlanType.ANNUAL, name: 'Annual package', priceMinor: 499900 },
];

/** Safety net: if the seed was never run the plan rows are missing and could not be edited. */
async function ensureDefaultPlans(): Promise<void> {
  if ((await prisma.plan.count()) >= DEFAULT_PLANS.length) return;
  for (const p of DEFAULT_PLANS) {
    await prisma.plan.upsert({ where: { type: p.type }, update: {}, create: { ...p, currency: env.CURRENCY } });
  }
}

/** Students see active plans only. Admin sees all, including switched-off ones. */
export async function listPlans(req: Request, res: Response) {
  await ensureDefaultPlans();
  const plans = await prisma.plan.findMany({
    where: req.auth!.role === Role.ADMIN ? {} : { active: true },
    orderBy: { id: 'asc' },
  });
  res.json(plans.map(toPlanItem));
}

/** Price changes only affect new purchases: purchases store the amount they were bought for. */
export async function updatePlan(req: Request, res: Response) {
  const type = req.params['type'] as PlanType;
  if (type !== PlanType.SINGLE && type !== PlanType.ANNUAL) throw badRequest('Unknown plan');
  const input = req.body as UpdatePlanInput;
  if (Object.keys(input).length === 0) throw badRequest('Nothing to update');
  await ensureDefaultPlans();
  const existing = await prisma.plan.findUnique({ where: { type } });
  if (!existing) throw notFound('Plan not found');

  const plan = await prisma.$transaction(async (tx) => {
    const updated = await tx.plan.update({ where: { type }, data: input });
    await audit(req.auth!.id, 'plan.update', 'Plan', updated.id, tx);
    return updated;
  });
  res.json(toPlanItem(plan));
}

// ---- Bundles ----

const bundleInclude = {
  courses: { select: { course: { select: { id: true, title: true, status: true } } } },
} satisfies Prisma.BundleInclude;
type BundleRecord = Prisma.BundleGetPayload<{ include: typeof bundleInclude }>;

function toBundleItem(b: BundleRecord): BundleItem {
  return {
    id: b.id,
    name: b.name,
    priceMinor: b.priceMinor,
    currency: b.currency,
    active: b.active,
    courses: b.courses
      .map((c) => ({ id: c.course.id, title: c.course.title, published: c.course.status === CourseStatus.PUBLISHED }))
      .sort((a, z) => a.title.localeCompare(z.title)),
  };
}

/**
 * Students: active bundles that still contain at least one published course (optionally one specific course),
 * with `owned` set when they already have every course in it. Admin: everything.
 */
export async function listBundles(req: Request, res: Response) {
  const { courseId } = listBundlesQuery.parse(req.query);
  const student = isStudent(req);
  const rows = await prisma.bundle.findMany({
    where: {
      ...(student ? { active: true } : {}),
      ...(courseId ? { courses: { some: { courseId } } } : {}),
    },
    include: bundleInclude,
    orderBy: { id: 'desc' },
  });

  let items = rows.map(toBundleItem);
  if (student) {
    const access = await getStudentAccess(req.auth!.id);
    items = items
      .map((b) => {
        const published = b.courses.filter((c) => c.published);
        return {
          ...b,
          courses: published,
          owned: published.length > 0 && published.every((c) => accessSourceFor(access, c.id) !== null),
        };
      })
      .filter((b) => b.courses.length > 0);
  }
  res.json(items);
}

/** Every course in a bundle must exist and be published when the admin saves it. */
async function assertPublishedCourses(courseIds: number[]): Promise<void> {
  const unique = [...new Set(courseIds)];
  if (unique.length !== courseIds.length) throw badRequest('A course can only be added once');
  const found = await prisma.course.count({ where: { id: { in: unique }, status: CourseStatus.PUBLISHED } });
  if (found !== unique.length) throw badRequest('Bundles can only contain published courses');
}

export async function createBundle(req: Request, res: Response) {
  const input = req.body as BundleInput;
  await assertPublishedCourses(input.courseIds);
  const bundle = await prisma.$transaction(async (tx) => {
    const created = await tx.bundle.create({
      data: {
        name: input.name,
        priceMinor: input.priceMinor,
        currency: env.CURRENCY,
        active: input.active,
        courses: { create: input.courseIds.map((courseId) => ({ courseId })) },
      },
      include: bundleInclude,
    });
    await audit(req.auth!.id, 'bundle.create', 'Bundle', created.id, tx);
    return created;
  });
  res.status(201).json(toBundleItem(bundle));
}

export async function updateBundle(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const input = req.body as UpdateBundleInput;
  if (Object.keys(input).length === 0) throw badRequest('Nothing to update');
  if (!(await prisma.bundle.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Bundle not found');
  if (input.courseIds) await assertPublishedCourses(input.courseIds);

  const bundle = await prisma.$transaction(async (tx) => {
    // Replacing the course list: past purchases keep working because they point at the bundle id, and access
    // is read from the bundle's courses. Documented in ASSUMPTIONS.md.
    if (input.courseIds) {
      await tx.bundleCourse.deleteMany({ where: { bundleId: id } });
      await tx.bundleCourse.createMany({ data: input.courseIds.map((courseId) => ({ bundleId: id, courseId })) });
    }
    const updated = await tx.bundle.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      include: bundleInclude,
    });
    await audit(req.auth!.id, 'bundle.update', 'Bundle', id, tx);
    return updated;
  });
  res.json(toBundleItem(bundle));
}

// ---- Published courses, for pickers (bundles, grants) ----

export async function listCourseOptions(_req: Request, res: Response) {
  const rows = await prisma.course.findMany({
    where: { status: CourseStatus.PUBLISHED },
    select: { id: true, title: true, category: true },
    orderBy: { title: 'asc' },
    take: 500,
  });
  const body: CourseOption[] = rows;
  res.json(body);
}

// ---- Admin: purchases and sales numbers ----

export function purchaseTitle(p: {
  type: PurchaseType;
  course: { title: string } | null;
  bundle: { name: string } | null;
}): string {
  if (p.type === PurchaseType.SINGLE) return p.course?.title ?? 'Single course';
  if (p.type === PurchaseType.BUNDLE) return p.bundle?.name ?? 'Course bundle';
  return 'Annual package';
}

export const purchaseSelect = {
  id: true,
  type: true,
  status: true,
  amountMinor: true,
  currency: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  course: { select: { title: true } },
  bundle: { select: { name: true } },
  student: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PurchaseSelect;
export type PurchaseRecord = Prisma.PurchaseGetPayload<{ select: typeof purchaseSelect }>;

export function toPurchaseRow(p: PurchaseRecord, withStudent: boolean): PurchaseRow {
  return {
    id: p.id,
    type: p.type,
    status: p.status,
    title: purchaseTitle(p),
    amountMinor: p.amountMinor,
    currency: p.currency,
    startsAt: p.startsAt.toISOString(),
    endsAt: p.endsAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    ...(withStudent ? { student: p.student } : {}),
  };
}

/** Completed purchases only (pending and failed attempts are not sales). Newest first. */
export async function listPurchases(req: Request, res: Response) {
  const q = paginationQuery.parse(req.query);
  const where: Prisma.PurchaseWhereInput = { status: { in: [PurchaseStatus.ACTIVE, PurchaseStatus.EXPIRED, PurchaseStatus.REFUNDED] } };
  const [total, rows] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({
      where,
      select: purchaseSelect,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  const body: Paginated<PurchaseRow> = {
    items: rows.map((r) => toPurchaseRow(r, true)),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
  res.json(body);
}

export async function getSalesSummary(_req: Request, res: Response) {
  const now = new Date();
  const live = { status: PurchaseStatus.ACTIVE, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } satisfies Prisma.PurchaseWhereInput;
  const [activeAnnual, activeBundles, activeSingles, revenue] = await Promise.all([
    prisma.purchase.count({ where: { ...live, type: PurchaseType.ANNUAL } }),
    prisma.purchase.count({ where: { ...live, type: PurchaseType.BUNDLE } }),
    prisma.purchase.count({ where: { ...live, type: PurchaseType.SINGLE } }),
    prisma.payment.aggregate({ _sum: { amountMinor: true }, where: { status: PaymentStatus.SUCCEEDED } }),
  ]);
  const body: SalesSummary = {
    currency: env.CURRENCY,
    activeAnnual,
    activeBundles,
    activeSingles,
    revenueMinor: revenue._sum.amountMinor ?? 0,
  };
  res.json(body);
}
