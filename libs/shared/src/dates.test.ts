import { describe, expect, it } from 'vitest';
import { addMonths } from './dates';
import { formatMoney, toMinor } from './money';

describe('addMonths', () => {
  it('adds twelve months', () => {
    expect(addMonths(new Date('2026-10-03T10:00:00Z'), 12).toISOString()).toBe('2027-10-03T10:00:00.000Z');
  });
  it('clamps to the end of a shorter month', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addMonths(new Date('2023-02-28T00:00:00Z'), 12).toISOString()).toBe('2024-02-28T00:00:00.000Z');
  });
  it('handles a leap day', () => {
    expect(addMonths(new Date('2024-02-29T00:00:00Z'), 12).toISOString()).toBe('2025-02-28T00:00:00.000Z');
  });
});

describe('money', () => {
  it('formats whole and fractional amounts', () => {
    expect(formatMoney(99900, 'INR')).toContain('999');
    expect(formatMoney(99950, 'INR')).toContain('999.50');
  });
  it('converts back to minor units', () => {
    expect(toMinor(999.5, 'INR')).toBe(99950);
    expect(toMinor(19, 'USD')).toBe(1900);
  });
});
