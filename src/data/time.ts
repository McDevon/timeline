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
 * Returns true if the ISO date string has full year-month-day precision.
 */
export function hasFullDate(isoDate: string): boolean {
  const rest = isoDate.startsWith('-') ? isoDate.slice(1) : isoDate;
  return rest.split('-').length >= 3;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  let rest = iso;
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
  return { year, month, day };
}

/**
 * Compute a precise calendar duration between two full ISO dates.
 * Uses year/month/day arithmetic with borrowing.
 */
export function formatPreciseDuration(startIso: string, endIso: string): string {
  const s = parseIsoDate(startIso);
  const e = parseIsoDate(endIso);

  let years = e.year - s.year;
  let months = e.month - s.month;
  let days = e.day - s.day;

  if (days < 0) {
    months--;
    // Borrow days from the previous month (relative to end date)
    const prevMonth = e.month - 1 <= 0 ? 12 : e.month - 1;
    days += DAYS_IN_MONTH[prevMonth - 1];
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr`);
  if (months > 0) parts.push(`${months} mo`);
  if (days > 0) parts.push(`${days} d`);
  return parts.length > 0 ? parts.join(' ') : '0 d';
}

/**
 * Convert a decimal year to an approximate ISO date string (year-month).
 */
export function decimalYearToIso(year: number): string {
  const floored = Math.floor(year);
  const decimalPart = year - floored;
  const month = Math.floor(decimalPart * 12) + 1;
  const absYear = Math.abs(floored);
  if (year < 0) {
    return `-${absYear}-${String(month).padStart(2, '0')}`;
  }
  return `${absYear}-${String(month).padStart(2, '0')}`;
}

/**
 * Shift an ISO date by a delta in decimal years, preserving the precision
 * of the original string (year-only, year-month, or full date).
 */
export function shiftIsoDate(iso: string, deltaYears: number): string {
  const negative = iso.startsWith('-');
  const rest = negative ? iso.slice(1) : iso;
  const parts = rest.split('-');
  const precision = parts.length;

  const origDecimal = dateToDecimalYear(iso);
  const newDecimal = origDecimal + deltaYears;

  if (precision === 1) {
    // Year-only: round to nearest integer year
    const y = Math.round(newDecimal);
    return y < 0 ? `${y}` : `${y}`;
  }

  // Year-month and full date: use day-of-year calendar math
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const newYear = Math.floor(newDecimal);
  const fraction = newDecimal - newYear;
  let dayOfYear = Math.round(fraction * 365) + 1;
  dayOfYear = Math.max(1, Math.min(dayOfYear, 365));

  let month = 0;
  for (let i = 0; i < 12; i++) {
    if (dayOfYear <= daysInMonth[i]) {
      month = i + 1;
      break;
    }
    dayOfYear -= daysInMonth[i];
    month = i + 2;
  }
  month = Math.min(month, 12);

  const absYear = Math.abs(newYear);
  const prefix = newYear < 0 ? `-${absYear}` : `${absYear}`;

  if (precision === 2) {
    return `${prefix}-${String(month).padStart(2, '0')}`;
  }

  const day = Math.max(1, Math.min(dayOfYear, daysInMonth[month - 1]));
  return `${prefix}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Format a decimal year difference as a human-readable magnitude string.
 * Precision adapts to the visible viewport span, not the distance itself.
 */
export function formatDecimalYearDelta(deltaYears: number, spanYears: number): string {
  const abs = Math.abs(deltaYears);
  const wholeYears = Math.floor(abs);
  const remainingMonths = Math.round((abs - wholeYears) * 12);

  if (spanYears > 50) {
    // Zoomed out: whole years only
    const rounded = Math.round(abs);
    return `${rounded} year${rounded !== 1 ? 's' : ''}`;
  }

  if (spanYears > 2) {
    // Medium zoom: years + months
    if (abs >= 1) {
      if (remainingMonths === 0) return `${wholeYears} yr`;
      return `${wholeYears} yr ${remainingMonths}mo`;
    }
    const months = Math.round(abs * 12);
    return `${months} month${months !== 1 ? 's' : ''}`;
  }

  // Zoomed in: full precision (years+months, months, or days)
  if (abs >= 1) {
    if (remainingMonths === 0) return `${wholeYears} yr`;
    return `${wholeYears} yr ${remainingMonths}mo`;
  }

  const months = abs * 12;
  if (months >= 1) {
    const wholeMonths = Math.round(months);
    return `${wholeMonths} month${wholeMonths !== 1 ? 's' : ''}`;
  }

  const days = Math.max(1, Math.round(abs * 365));
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

export function todayDecimalYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = (now.getTime() - start.getTime()) / 86400000;
  return now.getFullYear() + dayOfYear / 365;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
