import { describe, expect, it } from 'vitest';

import { toEpochMs } from '../src/types';

describe('toEpochMs', () => {
  it('passes numbers through', () => {
    expect(toEpochMs(1234)).toBe(1234);
  });

  it('converts dates to epoch milliseconds', () => {
    expect(toEpochMs(new Date('2026-10-21T12:00:00.000Z'))).toBe(1792584000000);
  });
});
