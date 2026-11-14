import { describe, expect, it, vi } from 'vitest';
import { getAssignmentProgress, issueCertificateIfEligible } from './certificates';

vi.mock('../config/prisma', () => ({ prisma: {} }));
vi.mock('../lib/log', () => ({ log: () => undefined }));

/** A tiny in-memory stand-in for the database calls the certificate rules make. */
function fakeDb(opts: { tasks: number; marks: (number | null)[]; quizScores: { score: number; passed: boolean }[]; existing?: boolean; maxAttempts?: number; extra?: { courseAssignmentId: number; status: string; marks: number | null }[] }) {
  const created: unknown[] = [];
  const db = {
    courseAssignment: { findMany: async () => Array.from({ length: opts.tasks }, (_, i) => ({ id: i + 1 })) },
    // `marks` = one ACCEPTED submission per task (in order); `extra` = any other submissions (rejected attempts, waiting ones).
    assignment: { findMany: async () => [...opts.marks.map((marks, i) => ({ courseAssignmentId: i + 1, status: 'ACCEPTED', marks })), ...(opts.extra ?? [])] },
    quizAttempt: {
      findFirst: async (args: { where: { scorePercent?: { gte: number }; passed: boolean } }) => {
        const min = args.where.scorePercent?.gte ?? 0;
        const hit = opts.quizScores.filter((q) => q.passed === args.where.passed && q.score >= min).sort((a, b) => b.score - a.score)[0];
        return hit ? { scorePercent: hit.score } : null;
      },
    },
    certificate: { findUnique: async () => (opts.existing ? { id: 1 } : null), create: async (a: unknown) => void created.push(a) },
    notification: { create: async () => undefined },
    course: { findUnique: async () => ({ title: 'Course', maxAttempts: opts.maxAttempts ?? 3 }) },
  };
  return { db: db as never, created };
}

describe('assignment progress', () => {
  it('averages the marks of the accepted assignments', async () => {
    const { db } = fakeDb({ tasks: 2, marks: [80, 60], quizScores: [] });
    expect(await getAssignmentProgress(1, 1, db)).toMatchObject({ required: 2, accepted: 2, pending: 0, averagePercent: 70, belowMin: false });
  });
  it('is below the minimum when the average is under 70', async () => {
    const { db } = fakeDb({ tasks: 2, marks: [80, 50], quizScores: [] });
    expect(await getAssignmentProgress(1, 1, db)).toMatchObject({ averagePercent: 65, belowMin: true });
  });
  it('is not "below" while assignments are still pending', async () => {
    const { db } = fakeDb({ tasks: 2, marks: [40], quizScores: [] });
    expect(await getAssignmentProgress(1, 1, db)).toMatchObject({ pending: 1, failed: 0, belowMin: false });
  });
  const rejected = (task: number, n: number) => Array.from({ length: n }, () => ({ courseAssignmentId: task, status: 'REJECTED', marks: 40 }));
  it('keeps an assignment pending while attempts are left after a rejection', async () => {
    const { db } = fakeDb({ tasks: 1, marks: [], extra: rejected(1, 2), quizScores: [] });
    expect(await getAssignmentProgress(1, 1, db)).toMatchObject({ pending: 1, failed: 0, belowMin: false });
  });
  it('fails an assignment once every attempt was used without passing', async () => {
    const { db } = fakeDb({ tasks: 2, marks: [90], extra: rejected(2, 3), quizScores: [] });
    expect(await getAssignmentProgress(1, 1, db)).toMatchObject({ accepted: 1, pending: 0, failed: 1, belowMin: true });
  });
  it('is not failed when the last attempt is still waiting for the instructor', async () => {
    const { db } = fakeDb({ tasks: 1, marks: [], extra: [...rejected(1, 2), { courseAssignmentId: 1, status: 'VERIFYING', marks: null }], quizScores: [] });
    expect(await getAssignmentProgress(1, 1, db)).toMatchObject({ pending: 1, failed: 0, belowMin: false });
  });
  it('passing on a later attempt counts as accepted with those marks', async () => {
    const { db } = fakeDb({ tasks: 1, marks: [85], extra: rejected(1, 2), quizScores: [] });
    expect(await getAssignmentProgress(1, 1, db)).toMatchObject({ accepted: 1, pending: 0, failed: 0, averagePercent: 85, belowMin: false });
  });
  it('follows the course attempt limit', async () => {
    const { db } = fakeDb({ tasks: 1, marks: [], extra: rejected(1, 3), maxAttempts: 5, quizScores: [] });
    expect(await getAssignmentProgress(1, 1, db)).toMatchObject({ pending: 1, failed: 0 });
  });
});

describe('issueCertificateIfEligible', () => {
  const ok = { tasks: 2, marks: [90, 70], quizScores: [{ score: 75, passed: true }] };

  it('issues when assignments and quiz are both 70% or more', async () => {
    const { db, created } = fakeDb(ok);
    expect(await issueCertificateIfEligible(1, 1, db)).toEqual({ issued: true });
    expect(created).toHaveLength(1);
  });
  it('does not issue when assignment marks average below 70', async () => {
    const { db, created } = fakeDb({ ...ok, marks: [60, 70] });
    expect(await issueCertificateIfEligible(1, 1, db)).toEqual({ issued: false, reason: 'assignments below minimum' });
    expect(created).toHaveLength(0);
  });
  it('does not issue when the quiz is below 70, even if it passed a lower course pass mark', async () => {
    const { db, created } = fakeDb({ ...ok, quizScores: [{ score: 65, passed: true }] });
    expect(await issueCertificateIfEligible(1, 1, db)).toEqual({ issued: false, reason: 'quiz not passed' });
    expect(created).toHaveLength(0);
  });
  it('does not issue when an assignment was failed on every attempt', async () => {
    const { db, created } = fakeDb({ ...ok, marks: [90], extra: Array.from({ length: 3 }, () => ({ courseAssignmentId: 2, status: 'REJECTED', marks: 30 })) });
    expect(await issueCertificateIfEligible(1, 1, db)).toEqual({ issued: false, reason: 'assignments below minimum' });
    expect(created).toHaveLength(0);
  });
  it('waits while an assignment is not accepted yet', async () => {
    const { db } = fakeDb({ ...ok, marks: [90] });
    expect(await issueCertificateIfEligible(1, 1, db)).toEqual({ issued: false, reason: 'assignments not approved' });
  });
  it('needs only the quiz when the course has no assignments', async () => {
    const { db } = fakeDb({ tasks: 0, marks: [], quizScores: [{ score: 70, passed: true }] });
    expect(await issueCertificateIfEligible(1, 1, db)).toEqual({ issued: true });
  });
  it('never issues a second certificate', async () => {
    const { db } = fakeDb({ ...ok, existing: true });
    expect(await issueCertificateIfEligible(1, 1, db)).toEqual({ issued: false, reason: 'already issued' });
  });
});
