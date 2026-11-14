import { describe, expect, it } from 'vitest';
import { effectivePassMark, isPassing, scoreQuiz } from './quiz';

const qs = [
  { id: 1, correctOptionId: 10 },
  { id: 2, correctOptionId: 20 },
  { id: 3, correctOptionId: 30 },
  { id: 4, correctOptionId: 40 },
];

describe('scoreQuiz', () => {
  it('scores all correct as 100', () => {
    expect(scoreQuiz(qs, qs.map((q) => ({ questionId: q.id, optionId: q.correctOptionId }))).percent).toBe(100);
  });
  it('counts unanswered and wrong as wrong', () => {
    const r = scoreQuiz(qs, [{ questionId: 1, optionId: 10 }, { questionId: 2, optionId: 99 }, { questionId: 3, optionId: null }]);
    expect(r).toEqual({ correct: 1, total: 4, percent: 25 });
  });
  it('uses the first answer for a repeated question', () => {
    expect(scoreQuiz(qs, [{ questionId: 1, optionId: 99 }, { questionId: 1, optionId: 10 }]).correct).toBe(0);
  });
  it('ignores answers for unknown questions', () => {
    expect(scoreQuiz(qs, [{ questionId: 999, optionId: 10 }]).correct).toBe(0);
  });
  it('handles an empty quiz', () => expect(scoreQuiz([], []).percent).toBe(0));
  it('passes at exactly the pass mark', () => {
    expect(isPassing(70, 70)).toBe(true);
    expect(isPassing(69, 70)).toBe(false);
  });
});

describe('effectivePassMark', () => {
  it('never goes below the 70% a certificate needs', () => {
    expect(effectivePassMark(50)).toBe(70);
    expect(effectivePassMark(70)).toBe(70);
    expect(effectivePassMark(85)).toBe(85);
  });
});
