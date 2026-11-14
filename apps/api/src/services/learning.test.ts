import { describe, expect, it } from 'vitest';
import { addLocks, quizDeadline, isLate, isLessonDone } from './learning';

describe('isLessonDone', () => {
  it('completes when the video ended', () => expect(isLessonDone(0, null, true)).toBe(true));
  it('completes at 90% watched', () => expect(isLessonDone(90, 100, false)).toBe(true));
  it('does not complete at 89%', () => expect(isLessonDone(89, 100, false)).toBe(false));
  it('needs a duration to judge by percentage', () => expect(isLessonDone(500, null, false)).toBe(false));
});

describe('addLocks', () => {
  it('unlocks only the first lesson at the start', () => {
    const r = addLocks([{ completed: false }, { completed: false }, { completed: false }]);
    expect(r.map((l) => l.locked)).toEqual([false, true, true]);
  });
  it('unlocks the next lesson after one is complete', () => {
    const r = addLocks([{ completed: true }, { completed: false }, { completed: false }]);
    expect(r.map((l) => l.locked)).toEqual([false, false, true]);
  });
  it('keeps later lessons locked behind a gap', () => {
    const r = addLocks([{ completed: true }, { completed: false }, { completed: true }]);
    expect(r.map((l) => l.locked)).toEqual([false, false, true]);
  });
  it('unlocks everything when all are complete', () => {
    expect(addLocks([{ completed: true }, { completed: true }]).every((l) => !l.locked)).toBe(true);
  });
});

describe('quiz timing', () => {
  const start = new Date('2030-01-01T10:00:00Z');
  it('computes the deadline', () => expect(quizDeadline(start, 30).toISOString()).toBe('2030-01-01T10:30:00.000Z'));
  it('allows a short grace period', () => {
    const deadline = quizDeadline(start, 30);
    expect(isLate(deadline, new Date('2030-01-01T10:30:30Z'))).toBe(false);
    expect(isLate(deadline, new Date('2030-01-01T10:31:30Z'))).toBe(true);
  });
});
