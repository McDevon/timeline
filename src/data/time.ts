/**
 * Convert an ISO date string to a decimal year for rendering math.
 *
 * Supported formats:
 *   "1471"        → 1471.0
 *   "1471-08"     → ~1471.58
 *   "1471-08-09"  → ~1471.60
 *   "-3000"       → -3000.0
 *   "-3000-06-15" → ~-2999.55 (mid-3000 BCE)
 */
export function dateToDecimalYear(isoDate: string): number {
  // Parse the string manually to handle negative (BCE) years
  // and partial formats without relying on Date which has year-0 issues.

  let rest = isoDate;
  let negative = false;

  if (rest.startsWith('-')) {
    negative = true;
    rest = rest.slice(1);
  }

  const parts = rest.split('-');
  let year = parseInt(parts[0], 10);
  if (negative) year = -year;

  const month = parts.length >= 2 ? parseInt(parts[1], 10) : 1;
  const day = parts.length >= 3 ? parseInt(parts[2], 10) : 1;

  // Approximate day-of-year fraction
  // Days per month (non-leap year approximation is fine for timeline purposes)
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let dayOfYear = day;
  for (let i = 0; i < month - 1; i++) {
    dayOfYear += daysInMonth[i];
  }

  // For year-only format, don't add any fractional part
  if (parts.length === 1) {
    return year;
  }

  const fraction = (dayOfYear - 1) / 365;
  return year + fraction;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Format an ISO date string for human display.
 *   "1471"        → "1471"
 *   "1471-08"     → "Aug 1471"
 *   "1471-08-09"  → "9 Aug 1471"
 *   "-3000"       → "3000 BCE"
 */
export function formatDate(isoDate: string): string {
  let rest = isoDate;
  let negative = false;
  if (rest.startsWith('-')) {
    negative = true;
    rest = rest.slice(1);
  }

  const parts = rest.split('-');
  const year = parseInt(parts[0], 10);
  const suffix = negative ? ' BCE' : '';

  if (parts.length === 1) {
    return `${year}${suffix}`;
  }

  const month = MONTH_NAMES[parseInt(parts[1], 10) - 1];

  if (parts.length === 2) {
    return `${month} ${year}${suffix}`;
  }

  const day = parseInt(parts[2], 10);
  return `${day} ${month} ${year}${suffix}`;
}

/**
 * Compute a human-readable duration between two ISO date strings.
 */
export function formatDuration(startIso: string, endIso: string): string {
  const years = dateToDecimalYear(endIso) - dateToDecimalYear(startIso);

  if (years >= 1) {
    const wholeYears = Math.floor(years);
    const remainingMonths = Math.round((years - wholeYears) * 12);
    if (remainingMonths === 0 || wholeYears >= 10) {
      return `${wholeYears} year${wholeYears !== 1 ? 's' : ''}`;
    }
    return `${wholeYears} yr ${remainingMonths} mo`;
  }

  const months = years * 12;
  if (months >= 1) {
    const wholeMonths = Math.round(months);
    return `${wholeMonths} month${wholeMonths !== 1 ? 's' : ''}`;
  }

  const days = Math.max(1, Math.round(years * 365));
  return `${days} day${days !== 1 ? 's' : ''}`;
}

/**
 * Format a decimal year as a display string for axis labels.
 * Adapts precision based on the visible time span.
 */
export function formatAxisLabel(decimalYear: number, spanYears: number): string {
  if (spanYears > 50) {
    // Show just years
    const year = Math.round(decimalYear);
    if (year < 0) return `${Math.abs(year)} BCE`;
    return `${year}`;
  }

  if (spanYears > 2) {
    // Show year
    const year = Math.floor(decimalYear);
    if (year < 0) return `${Math.abs(year)} BCE`;
    return `${year}`;
  }

  // Show month and year
  const year = Math.floor(decimalYear);
  const fraction = decimalYear - year;
  const monthIndex = Math.floor(fraction * 12);
  const month = MONTH_NAMES[Math.min(monthIndex, 11)];
  const absYear = Math.abs(year);
  const suffix = year < 0 ? ' BCE' : '';
  return `${month} ${absYear}${suffix}`;
}
