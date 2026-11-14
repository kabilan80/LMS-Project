import { AssignmentStatus } from './enums';
import { effectivePassMark, isPassing } from './quiz';

/**
 * Assignment attempts follow the same rules as quiz attempts: the course's `maxAttempts` (3 by default) and the
 * course pass mark (never below what a certificate needs). One submission = one attempt. All PURE, so the
 * server and the pages use exactly the same numbers.
 */

export interface AttemptSummary {
  /** Submissions sent so far (every one counts, even one still waiting for review). */
  used: number;
  max: number;
  /** Attempts still available. 0 once the student passed, even if some were never used. */
  left: number;
  passed: boolean;
  /** The latest submission is still waiting for the instructor (Submitted or Verifying). */
  waiting: boolean;
  /** Every attempt was used and none passed. */
  exhausted: boolean;
  canSubmit: boolean;
  /** Why a new submission is not possible (shown to the student); null when it is. */
  blockedReason: string | null;
}

/** `statuses` is the status of every submission the student made for ONE course assignment. */
export function summarizeAttempts(statuses: AssignmentStatus[], maxAttempts: number): AttemptSummary {
  const used = statuses.length;
  const passed = statuses.includes(AssignmentStatus.ACCEPTED);
  const waiting = statuses.some((s) => s === AssignmentStatus.SUBMITTED || s === AssignmentStatus.VERIFYING);
  const exhausted = !passed && !waiting && used >= maxAttempts;
  const left = passed ? 0 : Math.max(0, maxAttempts - used);
  let blockedReason: string | null = null;
  if (passed) blockedReason = 'You already passed this assignment';
  else if (waiting) blockedReason = 'Already submitted. Wait for your instructor to review it';
  else if (used >= maxAttempts) blockedReason = `You have used all ${maxAttempts} attempts`;
  return { used, max: maxAttempts, left, passed, waiting, exhausted, canSubmit: blockedReason === null, blockedReason };
}

/** Marks at or above the course's pass mark pass the attempt; lower marks fail it (the student may try again). */
export function gradeAttempt(marks: number, coursePassMark: number) {
  const passMark = effectivePassMark(coursePassMark);
  return { passMark, passed: isPassing(marks, passMark) };
}
