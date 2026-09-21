import { toQueryBoolean, toQueryList } from './list-query-transforms';

describe('toQueryList', () => {
  it('accepts a single value, repeated keys and comma separated values', () => {
    expect(toQueryList('PENDING')).toEqual(['PENDING']);
    expect(toQueryList(['PENDING', 'ASSIGNED'])).toEqual(['PENDING', 'ASSIGNED']);
    expect(toQueryList('PENDING, ASSIGNED')).toEqual(['PENDING', 'ASSIGNED']);
    expect(toQueryList(['PENDING,ASSIGNED', 'CLOSED'])).toEqual([
      'PENDING',
      'ASSIGNED',
      'CLOSED',
    ]);
  });

  it('leaves absence alone and drops empty entries', () => {
    expect(toQueryList(undefined)).toBeUndefined();
    expect(toQueryList('')).toEqual([]);
    expect(toQueryList('A,,B,')).toEqual(['A', 'B']);
  });
});

describe('toQueryBoolean', () => {
  it('is true only for true / "true"', () => {
    expect(toQueryBoolean('true')).toBe(true);
    expect(toQueryBoolean(true)).toBe(true);
    expect(toQueryBoolean('false')).toBe(false);
    expect(toQueryBoolean('1')).toBe(false);
    expect(toQueryBoolean(undefined)).toBe(false);
  });
});
