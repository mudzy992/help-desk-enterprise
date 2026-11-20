import {
  changeListCursor,
  changeListLimit,
  changeListLimits,
  changeOverFetch,
  changePage,
  changePageQuery,
} from './change-pagination';

describe('change pagination contract (BA-changes-18)', () => {
  it('reads the default page size when no limit is asked for', () => {
    expect(changeListLimit(undefined, changeListLimits.events)).toBe(50);
    expect(changeListLimit('', changeListLimits.templates)).toBe(50);
    expect(changeListLimit('abc', changeListLimits.approvals)).toBe(50);
    expect(changeListLimit('5.5', changeListLimits.events)).toBe(50);
  });

  it('clamps a limit into 1..max instead of trusting the caller', () => {
    expect(changeListLimit('10', changeListLimits.events)).toBe(10);
    expect(changeListLimit('0', changeListLimits.events)).toBe(1);
    expect(changeListLimit('-4', changeListLimits.events)).toBe(1);
    expect(changeListLimit('100000', changeListLimits.events)).toBe(200);
    // The clamp also holds when a service is called from code with a number.
    expect(changeListLimit(5000, changeListLimits.events)).toBe(200);
    expect(changeListLimit(0, changeListLimits.events)).toBe(1);
    expect(changeListLimit('100000', changeListLimits.templates)).toBe(500);
  });

  it('accepts only an id-shaped cursor', () => {
    expect(changeListCursor('evt-1')).toBe('evt-1');
    expect(changeListCursor(' evt-1 ')).toBe('evt-1');
    expect(changeListCursor(undefined)).toBeUndefined();
    expect(changeListCursor('')).toBeUndefined();
    expect(changeListCursor('x'.repeat(65))).toBeUndefined();
  });

  it('reads one row past the page so `hasMore` is a fact, not a guess', () => {
    expect(changeOverFetch(50)).toBe(51);
    expect(changeOverFetch(1)).toBe(2);
  });

  it('slices an over-fetched page and points the cursor at the last row shown', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(changePage(rows, 2)).toEqual({ items: [{ id: 'a' }, { id: 'b' }], hasMore: true, nextCursor: 'b' });
  });

  it('returns no cursor once the last page is reached', () => {
    expect(changePage([{ id: 'a' }, { id: 'b' }], 5)).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      hasMore: false,
      nextCursor: null,
    });
    expect(changePage([], 5)).toEqual({ items: [], hasMore: false, nextCursor: null });
  });

  it('an exactly full page is the end, not a hint of more', () => {
    // The one-row look-ahead is what makes this distinction possible.
    expect(changePage([{ id: 'a' }, { id: 'b' }], 2).hasMore).toBe(false);
  });

  it('builds a query from raw strings, dropping a cursor that is not one', () => {
    expect(changePageQuery({ limit: '25', cursor: 'evt-9' }, changeListLimits.events)).toEqual({
      limit: 25,
      cursor: 'evt-9',
    });
    expect(changePageQuery({ limit: undefined, cursor: undefined }, changeListLimits.events)).toEqual({
      limit: 50,
    });
    // Anything longer than an id cannot be one; the page then starts over
    // instead of asking Prisma for a row that cannot exist.
    expect(changePageQuery({ limit: '9999', cursor: 'x'.repeat(65) }, changeListLimits.events)).toEqual({
      limit: 200,
    });
  });
});
