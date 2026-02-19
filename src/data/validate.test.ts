import { describe, it, expect } from 'vitest';
import { validateEvents } from './validate';

describe('validateEvents', () => {
  it('accepts a valid array of events', () => {
    const data = [{ name: 'A', start: '2000' }];
    const result = validateEvents(data);
    expect('events' in result).toBe(true);
    if ('events' in result) {
      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('A');
    }
  });

  it('wraps a single event object in an array', () => {
    const data = { name: 'A', start: '2000' };
    const result = validateEvents(data);
    expect('events' in result).toBe(true);
    if ('events' in result) {
      expect(result.events).toHaveLength(1);
    }
  });

  it('rejects non-array non-object', () => {
    const result = validateEvents('hello');
    expect('error' in result).toBe(true);
  });

  it('rejects empty array', () => {
    const result = validateEvents([]);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/no events/i);
    }
  });

  it('rejects event without name', () => {
    const result = validateEvents([{ start: '2000' }]);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/name/);
    }
  });

  it('rejects event with empty name', () => {
    const result = validateEvents([{ name: '', start: '2000' }]);
    expect('error' in result).toBe(true);
  });

  it('rejects event without start', () => {
    const result = validateEvents([{ name: 'A' }]);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toMatch(/start/);
    }
  });

  it('rejects event with non-string start', () => {
    const result = validateEvents([{ name: 'A', start: 42 }]);
    expect('error' in result).toBe(true);
  });

  it('accepts event with valid end date', () => {
    const result = validateEvents([{ name: 'A', start: '2000', end: '2010' }]);
    expect('events' in result).toBe(true);
  });

  it('accepts ongoing end date', () => {
    const result = validateEvents([{ name: 'A', start: '2000', end: 'ongoing' }]);
    expect('events' in result).toBe(true);
  });

  it('rejects non-string end date', () => {
    const result = validateEvents([{ name: 'A', start: '2000', end: 123 }]);
    expect('error' in result).toBe(true);
  });

  it('accepts valid startApprox', () => {
    const result = validateEvents([{ name: 'A', start: '2000', startApprox: ['1999', '2001'] }]);
    expect('events' in result).toBe(true);
  });

  it('rejects invalid startApprox', () => {
    const result = validateEvents([{ name: 'A', start: '2000', startApprox: 'bad' }]);
    expect('error' in result).toBe(true);
  });

  it('rejects startApprox with wrong length', () => {
    const result = validateEvents([{ name: 'A', start: '2000', startApprox: ['1999'] }]);
    expect('error' in result).toBe(true);
  });

  it('accepts valid endApprox', () => {
    const result = validateEvents([{ name: 'A', start: '2000', end: '2010', endApprox: ['2009', '2011'] }]);
    expect('events' in result).toBe(true);
  });

  it('rejects invalid endApprox', () => {
    const result = validateEvents([{ name: 'A', start: '2000', end: '2010', endApprox: [1, 2] }]);
    expect('error' in result).toBe(true);
  });

  it('accepts optional info field', () => {
    const result = validateEvents([{ name: 'A', start: '2000', info: 'details' }]);
    expect('events' in result).toBe(true);
  });

  it('rejects non-string info', () => {
    const result = validateEvents([{ name: 'A', start: '2000', info: 42 }]);
    expect('error' in result).toBe(true);
  });

  it('validates nested events recursively', () => {
    const data = [{
      name: 'Parent',
      start: '2000',
      end: '2020',
      nested: [{ name: 'Child', start: '2005' }],
    }];
    const result = validateEvents(data);
    expect('events' in result).toBe(true);
  });

  it('rejects invalid nested events', () => {
    const data = [{
      name: 'Parent',
      start: '2000',
      end: '2020',
      nested: [{ name: '', start: '2005' }],
    }];
    const result = validateEvents(data);
    expect('error' in result).toBe(true);
  });

  it('rejects non-array nested field', () => {
    const data = [{
      name: 'Parent',
      start: '2000',
      nested: 'bad',
    }];
    const result = validateEvents(data);
    expect('error' in result).toBe(true);
  });

  it('rejects null input', () => {
    const result = validateEvents(null);
    expect('error' in result).toBe(true);
  });

  it('rejects number input', () => {
    const result = validateEvents(42);
    expect('error' in result).toBe(true);
  });

  it('rejects array of non-objects', () => {
    const result = validateEvents(['a', 'b']);
    expect('error' in result).toBe(true);
  });
});
