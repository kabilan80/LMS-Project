import type { Request, Response } from 'express';
import {
  ANNUAL_PLAN_MONTHS,
  CourseStatus,
  PaymentStatus,
  PlanType,
  PurchaseStatus,
  PurchaseType,
  addMonths,
  type CheckoutInput,
  type CheckoutOrder,
  type CheckoutResult,
  type ConfirmCheckoutInput,
  type GrantRow,
  type MyAccess,
} from '@lms/shared';
import { prisma } from '../config/prisma';
import { conflict, notFound } from '../middleware/errors';
import { accessSourceFor, expireOverduePurchases, getStudentAccess } from '../services/access';
import { getPaymentProvider } from '../services/payments';
import { grantSelect, toGrantRow } from './grants.controller';
import { purchaseSelect, purchaseTitle, toPurchaseRow } from './plans.controller';

/** An unpaid order older than this can no longer be confirmed; the student just starts again. */
const ORDER_TTL_MS = 30 * 60 * 1000;

interface PricedItem {
  type: PurchaseType;
  title: string;
  amountMinor: number;
  currency: string;
  courseId: number | null;
  bundleId: number | null;
}

/** Looks up what is being bought and its current price. Nothing here comes from the browser except the ids. */
async function priceItem(studentId: number, input: CheckoutInput): Promise<PricedItem> {
  const access = await getStudentAccess(studentId);

  if (input.type === PlanType.SINGLE) {
    const [course, plan] = await Promise.all([
      prisma.course.findUnique({ where: { id: input.courseId }, select: { id: true, title: true, status: true } }),
      prisma.plan.findUnique({ where: { type: PlanType.SINGLE } }),
    ]);
    if (!course || course.status !== CourseStatus.PUBLISHED) throw notFound('Course not found');
    if (!plan || !plan.active) throw conflict('Single course purchases are not available right now');
    const source = accessSourceFor(access, course.id);
    if (source) throw conflict('You already have access to this course');
    return { type: PurchaseType.SINGLE, title: course.title, amountMinor: plan.priceMinor, currency: plan.currency, courseId: course.id, bundleId: null };
  }

  if (input.type === PurchaseType.BUNDLE) {
    const bundle = await prisma.bundle.findUnique({
      where: { id: input.bundleId },
      include: { courses: { select: { course: { select: { id: true, status: true } } } } },
    });
    if (!bundle || !bundle.active) throw notFound('Bundle not found');
    const published = bundle.courses.map((c) => c.course).filter((c) => c.status === CourseStatus.PUBLISHED);
    if (published.length === 0) throw conflict('This bundle has no published courses right now');
    if (published.every((c) => accessSourceFor(access, c.id) !== null)) {
      throw conflict('You already have access to every course in this bundle');
    }
    return { type: PurchaseType.BUNDLE, title: bundle.name, amountMinor: bundle.priceMinor, currency: bundle.currency, courseId: null, bundleId: bundle.id };
  }

  const plan = await prisma.plan.findUnique({ where: { type: PlanType.ANNUAL } });
  if (!plan || !plan.active) throw conflict('The annual package is not available right now');
  if (access.annualUntil) throw conflict('Your annual package is still active');
  return { type: PurchaseType.ANNUAL, title: plan.name, amountMinor: plan.priceMinor, currency: plan.currency, courseId: null, bundleId: null };
}

/** Step 1: creates a pending payment and purchase, and returns the order for the payment screen. */
export async function createCheckout(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const item = await priceItem(studentId, req.body as CheckoutInput);
  const provider = getPaymentProvider();
  const { providerRef } = await provider.createOrder({
    amountMinor: item.amountMinor,
    currency: item.currency,
    description: item.title,
  });

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: { provider: provider.name, providerRef, amountMinor: item.amountMinor, currency: item.currency, status: PaymentStatus.PENDING },
    });
    await tx.purchase.create({
      data: {
        studentId,
        type: item.type,
        courseId: item.courseId,
        bundleId: item.bundleId,
        amountMinor: item.amountMinor,
        currency: item.currency,
        status: PurchaseStatus.PENDING,
        paymentId: payment.id,
      },
    });
  });

  const order: CheckoutOrder = {
    orderId: providerRef,
    type: item.type,
    title: item.title,
    amountMinor: item.amountMinor,
    currency: item.currency,
    provider: provider.name,
    testMode: provider.testMode,
  };
  res.status(201).json(order);
}

/**
 * Step 2: settles the order. Safe to call twice (a double click or a refresh returns the same result).
 * The payment row is claimed with a conditional update so two requests can never both activate the purchase.
 */
export async function confirmCheckout(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const { orderId, simulate } = req.body as ConfirmCheckoutInput;

  const payment = await prisma.payment.findUnique({
    where: { providerRef: orderId },
    include: { purchase: { select: { id: true, studentId: true, type: true, courseId: true, endsAt: true, course: { select: { title: true } }, bundle: { select: { name: true } } } } },
  });
  // Someone else's order looks exactly like a missing one.
  if (!payment || !payment.purchase || payment.purchase.studentId !== studentId) throw notFound('Order not found');
  const purchase = payment.purchase;

  const result = (status: 'SUCCEEDED' | 'FAILED', endsAt: Date | null): CheckoutResult => ({
    status,
    type: purchase.type,
    courseId: purchase.courseId,
    title: purchaseTitle(purchase),
    endsAt: endsAt?.toISOString() ?? null,
  });

  if (payment.status === PaymentStatus.SUCCEEDED) return void res.json(result('SUCCEEDED', purchase.endsAt));
  if (payment.status === PaymentStatus.FAILED) return void res.json(result('FAILED', null));
  if (payment.status !== PaymentStatus.PENDING) throw conflict('This order can no longer be paid');
  if (Date.now() - payment.createdAt.getTime() > ORDER_TTL_MS) {
    throw conflict('This order expired. Please start the checkout again.');
  }

  const outcome = await getPaymentProvider().settle(orderId, { simulate });
  const now = new Date();
  const endsAt = purchase.type === PurchaseType.ANNUAL ? addMonths(now, ANNUAL_PLAN_MONTHS) : null;

  const claimed = await prisma.$transaction(async (tx) => {
    const won = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: { status: outcome === 'SUCCEEDED' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED },
    });
    if (won.count === 0) return false; // another request settled it first
    if (outcome === 'SUCCEEDED') {
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: PurchaseStatus.ACTIVE, startsAt: now, endsAt },
      });
      await tx.notification.create({
        data: {
          userId: studentId,
          title: 'Payment successful',
          body: purchase.type === PurchaseType.ANNUAL
            ? 'Your annual package is active. Every published course is unlocked.'
            : `You now have access to "${purchaseTitle(purchase)}".`,
        },
      });
    } else {
      await tx.purchase.update({ where: { id: purchase.id }, data: { status: PurchaseStatus.FAILED } });
    }
    return true;
  });

  if (!claimed) {
    const latest = await prisma.payment.findUnique({
      where: { id: payment.id },
      select: { status: true, purchase: { select: { endsAt: true } } },
    });
    const ok = latest?.status === PaymentStatus.SUCCEEDED;
    return void res.json(result(ok ? 'SUCCEEDED' : 'FAILED', ok ? (latest?.purchase?.endsAt ?? null) : null));
  }
  res.json(result(outcome === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED', outcome === 'SUCCEEDED' ? endsAt : null));
}

/** The student's subscription page: annual status, purchase history (paid and attempted) and grants. */
export async function getMyAccess(req: Request, res: Response) {
  const studentId = req.auth!.id;
  await expireOverduePurchases(studentId);
  const [access, purchases, grants] = await Promise.all([
    getStudentAccess(studentId),
    prisma.purchase.findMany({
      where: { studentId, status: { not: PurchaseStatus.PENDING } },
      select: purchaseSelect,
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.accessGrant.findMany({
      where: { studentId, revokedAt: null },
      select: grantSelect,
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  const now = Date.now();
  const grantRows: GrantRow[] = grants.map(toGrantRow).filter((g) => !g.expiresAt || new Date(g.expiresAt).getTime() > now);
  const body: MyAccess = {
    annual: access.annualUntil ? { endsAt: access.annualUntil.toISOString() } : null,
    purchases: purchases.map((p) => toPurchaseRow(p, false)),
    grants: grantRows,
  };
  res.json(body);
}
