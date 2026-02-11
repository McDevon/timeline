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
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = monthNames[Math.min(monthIndex, 11)];
  const absYear = Math.abs(year);
  const suffix = year < 0 ? ' BCE' : '';
  return `${month} ${absYear}${suffix}`;
}
