// --- Leap year utilities ---

/** Returns true if the given CE year is a leap year (Gregorian rules). BCE years return false. */
export function isLeapYear(y: number): boolean {
  if (y <= 0) return false;
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

/** Returns 366 for leap years, 365 otherwise. */
export function daysInYear(y: number): number {
  return isLeapYear(y) ? 366 : 365;
}

/** Days in a given month (1-indexed). Returns 29 for Feb in leap years. */
export function daysInMonth(year: number, month: number): number {
  const base = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return base[month - 1];
}

/** Cumulative days before a 1-indexed month (e.g. month=1 → 0, month=2 → 31). */
export function monthStartDay(year: number, month: number): number {
  let days = 0;
  for (let m = 1; m < month; m++) {
    days += daysInMonth(year, m);
  }
  return days;
}

// --- Absolute day helpers for week bands ---

/** Days from Jan 1 CE year 1 to Jan 1 of year y (for CE years). */
function daysSinceYear1(y: number): number {
  const n = y - 1;
  return n * 365 + Math.floor(n / 4) - Math.floor(n / 100) + Math.floor(n / 400);
}

/** Days from Jan 1 2024 (epoch) to Jan 1 of year y. O(1) for CE years. */
export function daysFromEpochToYear(y: number): number {
  const epoch = 2024;
  if (y > 0 && epoch > 0) {
    return daysSinceYear1(y) - daysSinceYear1(epoch);
  }
  // BCE: iterate (rare at week-band zoom)
  let days = 0;
  if (y < epoch) {
    for (let yr = y; yr < epoch; yr++) {
      days -= daysInYear(yr > 0 ? yr : 1); // BCE treated as 365
    }
  } else {
    for (let yr = epoch; yr < y; yr++) {
      days += daysInYear(yr > 0 ? yr : 1);
    }
  }
  return days;
}

/** Convert a decimal year to a day offset from the epoch (Jan 1 2024). */
export function decYearToAbsDay(dy: number): number {
  const yr = Math.floor(dy);
  const frac = dy - yr;
  return daysFromEpochToYear(yr) + frac * daysInYear(yr);
}

/** Convert a day offset from epoch back to a decimal year. */
export function absDayToDecYear(d: number): number {
  // Estimate year from day offset
  const epoch = 2024;
  let yr = epoch + Math.floor(d / 365.2425);
  // Adjust: find the year that contains this day
  let yrStart = daysFromEpochToYear(yr);
  while (yrStart > d) {
    yr--;
    yrStart = daysFromEpochToYear(yr);
  }
  let nextYrStart = daysFromEpochToYear(yr + 1);
  while (nextYrStart <= d) {
    yr++;
    yrStart = nextYrStart;
    nextYrStart = daysFromEpochToYear(yr + 1);
  }
  const total = daysInYear(yr);
  return yr + (d - yrStart) / total;
}

// --- Core conversions ---

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

  let dayOfYear = day;
  for (let i = 1; i < month; i++) {
    dayOfYear += daysInMonth(year, i);
  }

  // For year-only format, don't add any fractional part
  if (parts.length === 1) {
    return year;
  }

  const fraction = (dayOfYear - 1) / daysInYear(year);
  return year + fraction;
}

export const MONTH_NAMES = [
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

/**
 * Returns true if the ISO date string has at least year-month precision.
 */
export function hasMonthDate(isoDate: string): boolean {
  const rest = isoDate.startsWith('-') ? isoDate.slice(1) : isoDate;
  return rest.split('-').length >= 2;
}

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
    const borrowYear = e.month - 1 <= 0 ? e.year - 1 : e.year;
    days += daysInMonth(borrowYear, prevMonth);
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
 * Convert a decimal year to a full YYYY-MM-DD ISO date string with day precision.
 * Uses the same day-of-year calendar math as dateToDecimalYear in reverse.
 */
export function decimalYearToDayIso(year: number): string {
  const floored = Math.floor(year);
  const fraction = year - floored;
  const totalDays = daysInYear(floored);
  let dayOfYear = Math.round(fraction * totalDays) + 1;
  dayOfYear = Math.max(1, Math.min(dayOfYear, totalDays));

  let month = 0;
  for (let i = 1; i <= 12; i++) {
    const dim = daysInMonth(floored, i);
    if (dayOfYear <= dim) {
      month = i;
      break;
    }
    dayOfYear -= dim;
    month = i + 1;
  }
  month = Math.min(month, 12);
  const day = Math.max(1, Math.min(dayOfYear, daysInMonth(floored, month)));
  const absYear = Math.abs(floored);
  const prefix = floored < 0 ? `-${absYear}` : `${absYear}`;
  return `${prefix}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const newYear = Math.floor(newDecimal);
  const fraction = newDecimal - newYear;
  const totalDays = daysInYear(newYear);
  let dayOfYear = Math.round(fraction * totalDays) + 1;
  dayOfYear = Math.max(1, Math.min(dayOfYear, totalDays));

  let month = 0;
  for (let i = 1; i <= 12; i++) {
    const dim = daysInMonth(newYear, i);
    if (dayOfYear <= dim) {
      month = i;
      break;
    }
    dayOfYear -= dim;
    month = i + 1;
  }
  month = Math.min(month, 12);

  const absYear = Math.abs(newYear);
  const prefix = newYear < 0 ? `-${absYear}` : `${absYear}`;

  if (precision === 2) {
    return `${prefix}-${String(month).padStart(2, '0')}`;
  }

  const day = Math.max(1, Math.min(dayOfYear, daysInMonth(newYear, month)));
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

  // Show year
  const year = Math.floor(decimalYear);
  if (year < 0) return `${Math.abs(year)} BCE`;
  return `${year}`;
}

export function todayDecimalYear(): number {
  const now = new Date();
  const y = now.getFullYear();
  const start = new Date(y, 0, 1);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return y + dayOfYear / daysInYear(y);
}

/**
 * Count the number of whole days between two full ISO date strings.
 * Uses actual calendar day counting via absolute day offsets.
 */
export function daysBetween(startIso: string, endIso: string): number {
  const s = dateToDecimalYear(startIso);
  const e = dateToDecimalYear(endIso);
  const startDay = decYearToAbsDay(s);
  const endDay = decYearToAbsDay(e);
  return Math.round(endDay - startDay);
}

/**
 * Format the duration between two full ISO dates as total days, e.g. "854 d".
 */
export function formatDaysDuration(startIso: string, endIso: string): string {
  const days = Math.abs(daysBetween(startIso, endIso));
  return `${days} d`;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
