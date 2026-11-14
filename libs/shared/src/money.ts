/** Money is stored as whole minor units (paise, cents). These helpers convert for display and input. */

function digitsFor(currency: string, locale: string): number {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** 99900 + "INR" -> "₹999". Whole amounts drop the decimals; others keep them (₹999.50). */
export function formatMoney(minor: number, currency: string, locale = 'en-IN'): string {
  const digits = digitsFor(currency, locale);
  const major = minor / 10 ** digits;
  const whole = Number.isInteger(major);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(major);
}

/** 999.5 + "INR" -> 99950. Rounds to the nearest minor unit. */
export function toMinor(major: number, currency: string, locale = 'en-IN'): number {
  return Math.round(major * 10 ** digitsFor(currency, locale));
}

/** 99950 + "INR" -> 999.5, for filling an input. */
export function toMajor(minor: number, currency: string, locale = 'en-IN'): number {
  return minor / 10 ** digitsFor(currency, locale);
}
