/**
 * Adds calendar months in UTC and clamps the day, so 31 Jan + 1 month is 28/29 Feb (not 3 Mar).
 * Used for the annual package: starts now, ends exactly ANNUAL_PLAN_MONTHS later.
 */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(y, m, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()),
  );
}
