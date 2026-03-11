import { describe, it, expect } from 'vitest';
import {
  dateToDecimalYear,
  formatDate,
  formatDuration,
  hasFullDate,
  formatPreciseDuration,
  decimalYearToIso,
  decimalYearToDayIso,
  formatDecimalYearDelta,
  formatAxisLabel,
  shiftIsoDate,
  isLeapYear,
  daysFromEpochToYear,
  decYearToAbsDay,
  absDayToDecYear,
  daysBetween,
  formatDaysDuration,
} from './time';

describe('isLeapYear', () => {
  it('returns true for divisible by 4', () => {
    expect(isLeapYear(2024)).toBe(true);
  });

  it('returns true for divisible by 400', () => {
    expect(isLeapYear(2000)).toBe(true);
  });

  it('returns false for divisible by 100 but not 400', () => {
    expect(isLeapYear(1900)).toBe(false);
  });

  it('returns false for non-leap year', () => {
    expect(isLeapYear(2023)).toBe(false);
  });

  it('returns false for BCE years', () => {
    expect(isLeapYear(-4)).toBe(false);
    expect(isLeapYear(0)).toBe(false);
  });
});

describe('dateToDecimalYear', () => {
  it('returns integer for year-only format', () => {
    expect(dateToDecimalYear('2000')).toBe(2000);
    expect(dateToDecimalYear('1')).toBe(1);
  });

  it('handles negative (BCE) year-only', () => {
    expect(dateToDecimalYear('-3000')).toBe(-3000);
    expect(dateToDecimalYear('-1')).toBe(-1);
  });

  it('adds fractional part for year-month', () => {
    const val = dateToDecimalYear('2000-07');
    // July 1 in leap year 2000: day 183, fraction = 182/366
    expect(val).toBeGreaterThan(2000);
    expect(val).toBeLessThan(2001);
  });

  it('adds fractional part for full date', () => {
    const val = dateToDecimalYear('2000-01-01');
    // Jan 1 → dayOfYear=1, fraction=(1-1)/366=0
    expect(val).toBe(2000);
  });

  it('handles Jan 1 as zero fraction', () => {
    expect(dateToDecimalYear('2000-01-01')).toBe(2000);
  });

  it('handles end of year (leap year)', () => {
    const val = dateToDecimalYear('2000-12-31');
    // Dec 31 of leap year → dayOfYear = 366, fraction = 365/366
    expect(val).toBeCloseTo(2000 + 365 / 366, 5);
  });

  it('handles end of year (non-leap year)', () => {
    const val = dateToDecimalYear('2001-12-31');
    // Dec 31 of non-leap year → fraction = 364/365
    expect(val).toBeCloseTo(2001 + 364 / 365, 5);
  });

  it('handles negative year with month and day', () => {
    const val = dateToDecimalYear('-3000-06-15');
    expect(val).toBeGreaterThan(-3000);
    expect(val).toBeLessThan(-2999);
  });

  it('Feb 1 gives correct fraction (leap year)', () => {
    const val = dateToDecimalYear('2000-02-01');
    // Feb 1 → dayOfYear = 32, fraction = 31/366
    expect(val).toBeCloseTo(2000 + 31 / 366, 5);
  });

  it('Feb 1 gives correct fraction (non-leap year)', () => {
    const val = dateToDecimalYear('2001-02-01');
    // Feb 1 → dayOfYear = 32, fraction = 31/365
    expect(val).toBeCloseTo(2001 + 31 / 365, 5);
  });

  it('Feb 29 has its own position distinct from Mar 1', () => {
    const feb29 = dateToDecimalYear('2024-02-29');
    const mar1 = dateToDecimalYear('2024-03-01');
    expect(feb29).not.toBe(mar1);
    expect(mar1).toBeGreaterThan(feb29);
  });
});

describe('formatDate', () => {
  it('formats year only', () => {
    expect(formatDate('2000')).toBe('2000');
  });

  it('formats year-month', () => {
    expect(formatDate('2000-08')).toBe('Aug 2000');
  });

  it('formats full date', () => {
    expect(formatDate('2000-08-09')).toBe('9 Aug 2000');
  });

  it('formats BCE year', () => {
    expect(formatDate('-3000')).toBe('3000 BCE');
  });

  it('formats BCE year-month', () => {
    expect(formatDate('-3000-06')).toBe('Jun 3000 BCE');
  });

  it('formats BCE full date', () => {
    expect(formatDate('-753-04-21')).toBe('21 Apr 753 BCE');
  });

  it('formats January correctly', () => {
    expect(formatDate('2000-01')).toBe('Jan 2000');
  });

  it('formats December correctly', () => {
    expect(formatDate('2000-12')).toBe('Dec 2000');
  });
});

describe('formatDuration', () => {
  it('formats multi-year duration', () => {
    expect(formatDuration('2000', '2005')).toBe('5 years');
  });

  it('formats single year', () => {
    expect(formatDuration('2000', '2001')).toBe('1 year');
  });

  it('formats years with months', () => {
    expect(formatDuration('2000-01', '2002-07')).toBe('2 yr 6 mo');
  });

  it('suppresses months for 10+ years', () => {
    expect(formatDuration('2000', '2015')).toBe('15 years');
  });

  it('formats months', () => {
    expect(formatDuration('2000-01', '2000-06')).toBe('5 months');
  });

  it('formats single month', () => {
    expect(formatDuration('2000-01-01', '2000-02-01')).toMatch(/month/);
  });

  it('formats days for short durations', () => {
    expect(formatDuration('2000-01-01', '2000-01-15')).toMatch(/day/);
  });

  it('returns at least 1 day', () => {
    expect(formatDuration('2000-01-01', '2000-01-01')).toBe('1 day');
  });
});

describe('hasFullDate', () => {
  it('returns false for year-only', () => {
    expect(hasFullDate('2000')).toBe(false);
  });

  it('returns false for year-month', () => {
    expect(hasFullDate('2000-08')).toBe(false);
  });

  it('returns true for full date', () => {
    expect(hasFullDate('2000-08-09')).toBe(true);
  });

  it('returns true for BCE full date', () => {
    expect(hasFullDate('-3000-06-15')).toBe(true);
  });

  it('returns false for BCE year-only', () => {
    expect(hasFullDate('-3000')).toBe(false);
  });
});

describe('formatPreciseDuration', () => {
  it('formats zero duration', () => {
    expect(formatPreciseDuration('2000-01-01', '2000-01-01')).toBe('0 d');
  });

  it('formats days only', () => {
    expect(formatPreciseDuration('2000-01-01', '2000-01-15')).toBe('14 d');
  });

  it('formats months and days', () => {
    expect(formatPreciseDuration('2000-01-01', '2000-03-15')).toBe('2 mo 14 d');
  });

  it('formats years, months, days', () => {
    expect(formatPreciseDuration('2000-01-01', '2002-03-15')).toBe('2 yr 2 mo 14 d');
  });

  it('handles day borrowing', () => {
    expect(formatPreciseDuration('2000-01-30', '2000-03-01')).toBe('1 mo');
  });

  it('handles month borrowing', () => {
    // Feb 2001 - Nov 2000 → 3 mo
    expect(formatPreciseDuration('2000-11-15', '2001-02-15')).toBe('3 mo');
  });

  it('formats exact years', () => {
    expect(formatPreciseDuration('2000-01-01', '2003-01-01')).toBe('3 yr');
  });
});

describe('decimalYearToDayIso', () => {
  it('converts integer year to Jan 1', () => {
    expect(decimalYearToDayIso(2000)).toBe('2000-01-01');
  });

  it('converts mid-year correctly for leap year', () => {
    // 2000 is leap: dayOfYear = round(0.5 * 366) + 1 = 183 + 1 = 184 → Jul 2
    expect(decimalYearToDayIso(2000.5)).toBe('2000-07-02');
  });

  it('converts mid-year correctly for non-leap year', () => {
    // 2001 is non-leap: dayOfYear = round(0.5 * 365) + 1 = 183 + 1 = 184 → Jul 3
    expect(decimalYearToDayIso(2001.5)).toBe('2001-07-03');
  });

  it('converts negative year', () => {
    expect(decimalYearToDayIso(-3000)).toBe('-3000-01-01');
  });

  it('round-trips with dateToDecimalYear for Jan 1', () => {
    const dec = dateToDecimalYear('2000-01-01');
    expect(decimalYearToDayIso(dec)).toBe('2000-01-01');
  });

  it('round-trips with dateToDecimalYear for Aug 9', () => {
    const dec = dateToDecimalYear('1471-08-09');
    expect(decimalYearToDayIso(dec)).toBe('1471-08-09');
  });

  it('round-trips with dateToDecimalYear for Dec 31', () => {
    const dec = dateToDecimalYear('2000-12-31');
    expect(decimalYearToDayIso(dec)).toBe('2000-12-31');
  });

  it('round-trips with dateToDecimalYear for BCE date', () => {
    const dec = dateToDecimalYear('-753-04-21');
    expect(decimalYearToDayIso(dec)).toBe('-753-04-21');
  });

  it('round-trips Feb 29 in a leap year', () => {
    const dec = dateToDecimalYear('2024-02-29');
    expect(decimalYearToDayIso(dec)).toBe('2024-02-29');
  });

  it('round-trips Feb 29 in year 2000', () => {
    const dec = dateToDecimalYear('2000-02-29');
    expect(decimalYearToDayIso(dec)).toBe('2000-02-29');
  });
});

describe('decimalYearToIso', () => {
  it('converts integer year', () => {
    expect(decimalYearToIso(2000)).toBe('2000-01');
  });

  it('converts mid-year', () => {
    expect(decimalYearToIso(2000.5)).toBe('2000-07');
  });

  it('converts negative year', () => {
    expect(decimalYearToIso(-3000)).toBe('-3000-01');
  });

  it('pads month with leading zero', () => {
    expect(decimalYearToIso(2000.1)).toMatch(/-\d{2}$/);
  });

  it('converts near end of year', () => {
    const iso = decimalYearToIso(2000.9);
    // 0.9 * 12 = 10.8 → month 11
    expect(iso).toBe('2000-11');
  });
});

describe('formatDecimalYearDelta', () => {
  it('shows whole years when zoomed out (span > 50)', () => {
    expect(formatDecimalYearDelta(5.3, 100)).toBe('5 years');
  });

  it('shows singular year when delta rounds to 1 (span > 50)', () => {
    expect(formatDecimalYearDelta(1.2, 100)).toBe('1 year');
  });

  it('shows years + months at medium zoom (span > 2)', () => {
    expect(formatDecimalYearDelta(2.5, 10)).toBe('2 yr 6mo');
  });

  it('shows months only at medium zoom when < 1 year (span > 2)', () => {
    expect(formatDecimalYearDelta(0.5, 10)).toBe('6 months');
  });

  it('shows days when zoomed in and very short', () => {
    const result = formatDecimalYearDelta(0.01, 1);
    expect(result).toMatch(/day/);
  });

  it('handles negative delta', () => {
    expect(formatDecimalYearDelta(-5, 100)).toBe('5 years');
  });
});

describe('formatAxisLabel', () => {
  it('shows year when zoomed out (span > 50)', () => {
    expect(formatAxisLabel(2000, 100)).toBe('2000');
  });

  it('shows BCE for negative years (span > 50)', () => {
    expect(formatAxisLabel(-3000, 100)).toBe('3000 BCE');
  });

  it('shows year at medium zoom (span > 2)', () => {
    expect(formatAxisLabel(2000.5, 10)).toBe('2000');
  });

  it('shows year when zoomed in (span <= 2)', () => {
    expect(formatAxisLabel(2000.5, 1)).toBe('2000');
  });

  it('shows BCE for negative years when zoomed in', () => {
    expect(formatAxisLabel(-3000.5, 1)).toBe('3001 BCE');
  });

  it('shows year for integer year when zoomed in', () => {
    expect(formatAxisLabel(2000, 1)).toBe('2000');
  });
});

describe('shiftIsoDate', () => {
  it('shifts year-only forward', () => {
    expect(shiftIsoDate('2000', 5)).toBe('2005');
  });

  it('shifts year-only backward', () => {
    expect(shiftIsoDate('2000', -3)).toBe('1997');
  });

  it('shifts year-only across zero', () => {
    expect(shiftIsoDate('2', -5)).toBe('-3');
  });

  it('shifts negative year-only', () => {
    expect(shiftIsoDate('-3000', 100)).toBe('-2900');
  });

  it('rounds year-only for fractional delta', () => {
    expect(shiftIsoDate('2000', 0.3)).toBe('2000');
    expect(shiftIsoDate('2000', 0.6)).toBe('2001');
  });

  it('shifts year-month preserving month precision', () => {
    const result = shiftIsoDate('2000-06', 5);
    expect(result).toMatch(/^\d+-\d{2}$/);
    // 2000.41.. + 5 = 2005.41.. → should be around June 2005
    expect(result).toBe('2005-06');
  });

  it('shifts year-month backward', () => {
    const result = shiftIsoDate('2000-06', -1);
    expect(result).toBe('1999-06');
  });

  it('shifts negative year-month', () => {
    const result = shiftIsoDate('-3000-06', 10);
    expect(result).toMatch(/-\d+-\d{2}$/);
  });

  it('shifts full date preserving day precision', () => {
    const result = shiftIsoDate('2000-06-15', 5);
    expect(result).toMatch(/^\d+-\d{2}-\d{2}$/);
    // Should be approximately June 15, 2005
    expect(result).toMatch(/^2005-06-/);
  });

  it('shifts full date backward', () => {
    const result = shiftIsoDate('2000-03-01', -1);
    expect(result).toMatch(/^1999-03-/);
  });

  it('shifts Jan 1 by integer years exactly', () => {
    expect(shiftIsoDate('2000-01-01', 5)).toBe('2005-01-01');
  });

  it('shifts negative full date', () => {
    const result = shiftIsoDate('-753-04-21', 100);
    expect(result).toMatch(/^-653-04-/);
  });

  it('clamps day to valid range', () => {
    // Shifting by a fractional amount should still produce a valid date
    const result = shiftIsoDate('2000-01-31', 0.5);
    expect(result).toMatch(/^\d+-\d{2}-\d{2}$/);
    const day = parseInt(result.split('-').pop()!, 10);
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(31);
  });
});

describe('daysFromEpochToYear', () => {
  it('returns 0 for epoch year 2024', () => {
    expect(daysFromEpochToYear(2024)).toBe(0);
  });

  it('returns 366 for 2025 (2024 is a leap year)', () => {
    expect(daysFromEpochToYear(2025)).toBe(366);
  });

  it('returns -365 for 2023 (2023 is not a leap year)', () => {
    expect(daysFromEpochToYear(2023)).toBe(-365);
  });
});

describe('decYearToAbsDay / absDayToDecYear round-trip', () => {
  it('round-trips for start of 2024', () => {
    const day = decYearToAbsDay(2024.0);
    expect(day).toBeCloseTo(0);
    expect(absDayToDecYear(day)).toBeCloseTo(2024.0, 5);
  });

  it('round-trips for mid-2024', () => {
    const dy = 2024.5;
    const day = decYearToAbsDay(dy);
    expect(absDayToDecYear(day)).toBeCloseTo(dy, 5);
  });

  it('round-trips for start of 2020', () => {
    const dy = 2020.0;
    const day = decYearToAbsDay(dy);
    expect(absDayToDecYear(day)).toBeCloseTo(dy, 5);
  });

  it('round-trips for mid-1900', () => {
    const dy = 1900.5;
    const day = decYearToAbsDay(dy);
    expect(absDayToDecYear(day)).toBeCloseTo(dy, 5);
  });
});

describe('daysBetween', () => {
  it('returns 0 for same date', () => {
    expect(daysBetween('2024-01-01', '2024-01-01')).toBe(0);
  });

  it('counts days within a month', () => {
    expect(daysBetween('2024-01-01', '2024-01-15')).toBe(14);
  });

  it('counts days across months', () => {
    expect(daysBetween('2024-01-15', '2024-03-01')).toBe(46);
  });

  it('counts days across a non-leap year', () => {
    expect(daysBetween('2023-01-01', '2024-01-01')).toBe(365);
  });

  it('counts days across a leap year', () => {
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });

  it('handles multi-year spans', () => {
    // 2020-01-01 to 2024-01-01: 2020(leap 366) + 2021(365) + 2022(365) + 2023(365) = 1461
    expect(daysBetween('2020-01-01', '2024-01-01')).toBe(1461);
  });
});

describe('formatDaysDuration', () => {
  it('formats single day', () => {
    expect(formatDaysDuration('2024-01-01', '2024-01-02')).toBe('1 d');
  });

  it('formats multi-day span', () => {
    expect(formatDaysDuration('2024-01-01', '2024-01-15')).toBe('14 d');
  });

  it('formats zero days', () => {
    expect(formatDaysDuration('2024-06-15', '2024-06-15')).toBe('0 d');
  });

  it('handles reversed order (absolute value)', () => {
    expect(formatDaysDuration('2024-01-15', '2024-01-01')).toBe('14 d');
  });
});
