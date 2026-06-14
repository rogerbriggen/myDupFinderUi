import { describe, expect, it } from 'vitest';

import { defaultSourceFilter } from './report-store';

describe('defaultSourceFilter', () => {
  it('returns both sources for a two-source report', () => {
    expect(defaultSourceFilter(true)).toEqual(['Base', 'Second']);
  });

  it('returns only Base for a single-DB report', () => {
    // The source chips are hidden in this case — a stale ['Second'] would
    // silently empty the table.
    expect(defaultSourceFilter(false)).toEqual(['Base']);
  });
});
