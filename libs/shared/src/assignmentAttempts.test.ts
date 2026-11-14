import { describe, expect, it } from 'vitest';
import { gradeAttempt, summarizeAttempts } from './assignmentAttempts';

const { SUBMITTED, VERIFYING, ACCEPTED, REJECTED } = { SUBMITTED: 'SUBMITTED', VERIFYING: 'VERIFYING', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED' } as const;

describe('summarizeAttempts', () => {
  it('allows the first attempt', () => {
    expect(summarizeAttempts([], 3)).toMatchObject({ used: 0, left: 3, canSubmit: true, blockedReason: null });
  });
  it('blocks while a submission waits for review', () => {
    for (const s of [SUBMITTED, VERIFYING]) {
      expect(summarizeAttempts([s], 3)).toMatchObject({ used: 1, left: 2, waiting: true, canSubmit: false });
    }
  });
  it('allows another attempt after a rejection or low marks (both are REJECTED)', () => {
    expect(summarizeAttempts([REJECTED], 3)).toMatchObject({ used: 1, left: 2, canSubmit: true });
    expect(summarizeAttempts([REJECTED, REJECTED], 3)).toMatchObject({ used: 2, left: 1, canSubmit: true });
  });
  it('stops after the last attempt is used and failed', () => {
    const r = summarizeAttempts([REJECTED, REJECTED, REJECTED], 3);
    expect(r).toMatchObject({ used: 3, left: 0, exhausted: true, canSubmit: false });
    expect(r.blockedReason).toBe('You have used all 3 attempts');
  });
  it('stops once passed, even with attempts left', () => {
    expect(summarizeAttempts([REJECTED, ACCEPTED], 3)).toMatchObject({ used: 2, left: 0, passed: true, exhausted: false, canSubmit: false });
  });
  it('passing on the last attempt is not "exhausted"', () => {
    expect(summarizeAttempts([REJECTED, REJECTED, ACCEPTED], 3)).toMatchObject({ passed: true, exhausted: false });
  });
  it('a third attempt still waiting for review is not exhausted yet', () => {
    expect(summarizeAttempts([REJECTED, REJECTED, SUBMITTED], 3)).toMatchObject({ exhausted: false, waiting: true, left: 0 });
  });
  it('follows the course attempt limit', () => {
    expect(summarizeAttempts([REJECTED, REJECTED, REJECTED], 5)).toMatchObject({ left: 2, canSubmit: true });
  });
});

describe('gradeAttempt', () => {
  it('passes at the pass mark and fails below it', () => {
    expect(gradeAttempt(70, 70)).toEqual({ passMark: 70, passed: true });
    expect(gradeAttempt(69, 70)).toEqual({ passMark: 70, passed: false });
  });
  it('never uses a pass mark below the certificate minimum (70)', () => {
    expect(gradeAttempt(60, 50)).toEqual({ passMark: 70, passed: false });
  });
  it('uses a higher course pass mark', () => {
    expect(gradeAttempt(75, 80)).toEqual({ passMark: 80, passed: false });
    expect(gradeAttempt(80, 80).passed).toBe(true);
  });
});
