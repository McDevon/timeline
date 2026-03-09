import { TimelineEvent } from '../types';
import { dateToDecimalYear } from './time';
import { VALID_COLOR_IDS } from '../colorPalette';

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isStringPair(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && isString(v[0]) && isString(v[1]);
}

function isDateString(s: string): boolean {
  try {
    dateToDecimalYear(s);
    return true;
  } catch {
    return false;
  }
}

function validateEvent(obj: unknown, path: string): string | null {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return `${path}: expected an object`;
  }

  const record = obj as Record<string, unknown>;

  if (!isString(record.name) || record.name.length === 0) {
    return `${path}: missing or invalid 'name' (must be a non-empty string)`;
  }

  const name = record.name;

  if (!isString(record.start)) {
    return `${path} "${name}": missing or invalid 'start' (must be a string)`;
  }
  if (!isDateString(record.start)) {
    return `${path} "${name}": invalid start date "${record.start}"`;
  }

  if (record.end !== undefined) {
    if (!isString(record.end)) {
      return `${path} "${name}": 'end' must be a string`;
    }
    if (record.end !== 'ongoing' && !isDateString(record.end)) {
      return `${path} "${name}": invalid end date "${record.end}"`;
    }
  }

  if (record.startApprox !== undefined) {
    if (!isStringPair(record.startApprox)) {
      return `${path} "${name}": 'startApprox' must be [string, string]`;
    }
    if (!isDateString(record.startApprox[0]) || !isDateString(record.startApprox[1])) {
      return `${path} "${name}": invalid dates in 'startApprox'`;
    }
  }

  if (record.endApprox !== undefined) {
    if (!isStringPair(record.endApprox)) {
      return `${path} "${name}": 'endApprox' must be [string, string]`;
    }
    if (!isDateString(record.endApprox[0]) || !isDateString(record.endApprox[1])) {
      return `${path} "${name}": invalid dates in 'endApprox'`;
    }
  }

  if (record.info !== undefined && !isString(record.info)) {
    return `${path} "${name}": 'info' must be a string`;
  }

  if (record.color !== undefined) {
    if (!isString(record.color)) {
      return `${path} "${name}": 'color' must be a string`;
    }
    if (!VALID_COLOR_IDS.has(record.color)) {
      return `${path} "${name}": unknown color "${record.color}"`;
    }
  }

  if (record.nested !== undefined) {
    if (!Array.isArray(record.nested)) {
      return `${path} "${name}": 'nested' must be an array`;
    }
    for (let i = 0; i < record.nested.length; i++) {
      const err = validateEvent(record.nested[i], `${path} "${name}" > nested[${i}]`);
      if (err) return err;
    }
  }

  return null;
}

/**
 * Validate unknown JSON data as TimelineEvent[].
 * Accepts an array of events or a single event object (wrapped in an array).
 */
export function validateEvents(data: unknown): { events: TimelineEvent[] } | { error: string } {
  // Single event object
  if (typeof data === 'object' && data !== null && !Array.isArray(data) && 'name' in data && 'start' in data) {
    const err = validateEvent(data, 'root');
    if (err) return { error: err };
    return { events: [data as TimelineEvent] };
  }

  if (!Array.isArray(data)) {
    return { error: 'Expected an array of events or a single event object' };
  }

  if (data.length === 0) {
    return { error: 'File contains no events' };
  }

  for (let i = 0; i < data.length; i++) {
    const err = validateEvent(data[i], `[${i}]`);
    if (err) return { error: err };
  }

  return { events: data as TimelineEvent[] };
}
