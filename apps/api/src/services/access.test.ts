import { describe, expect, it } from 'vitest';
import { accessSourceFor, resolveAccess } from './access';

const future = new Date('2030-01-01T00:00:00Z');

describe('resolveAccess', () => {
  it('locks everything with no purchases or grants', () => {
    expect(accessSourceFor(resolveAccess([], []), 1)).toBeNull();
  });
  it('single purchase unlocks only that course', () => {
    const a = resolveAccess([{ type: 'SINGLE', courseId: 5, endsAt: null, bundleCourseIds: [] }], []);
    expect(accessSourceFor(a, 5)).toBe('SINGLE');
    expect(accessSourceFor(a, 6)).toBeNull();
  });
  it('bundle unlocks every course in it', () => {
    const a = resolveAccess([{ type: 'BUNDLE', courseId: null, endsAt: null, bundleCourseIds: [1, 2, 3] }], []);
    expect([1, 2, 3].map((id) => accessSourceFor(a, id))).toEqual(['BUNDLE', 'BUNDLE', 'BUNDLE']);
    expect(accessSourceFor(a, 4)).toBeNull();
  });
  it('annual unlocks every course', () => {
    const a = resolveAccess([{ type: 'ANNUAL', courseId: null, endsAt: future, bundleCourseIds: [] }], []);
    expect(accessSourceFor(a, 999)).toBe('ANNUAL');
    expect(a.annualUntil).toEqual(future);
  });
  it('a grant unlocks one course', () => {
    const a = resolveAccess([], [{ courseId: 7 }]);
    expect(accessSourceFor(a, 7)).toBe('GRANT');
    expect(accessSourceFor(a, 8)).toBeNull();
  });
  it('reports lifetime sources before annual when several apply', () => {
    const a = resolveAccess(
      [
        { type: 'ANNUAL', courseId: null, endsAt: future, bundleCourseIds: [] },
        { type: 'SINGLE', courseId: 2, endsAt: null, bundleCourseIds: [] },
      ],
      [{ courseId: 2 }],
    );
    expect(accessSourceFor(a, 2)).toBe('SINGLE');
    expect(accessSourceFor(a, 3)).toBe('ANNUAL');
  });
  it('keeps the latest annual end date', () => {
    const later = new Date('2031-01-01T00:00:00Z');
    const a = resolveAccess(
      [
        { type: 'ANNUAL', courseId: null, endsAt: future, bundleCourseIds: [] },
        { type: 'ANNUAL', courseId: null, endsAt: later, bundleCourseIds: [] },
      ],
      [],
    );
    expect(a.annualUntil).toEqual(later);
  });
});
