import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListTicketsQueryDto } from '../dto/list-tickets-query.dto';
import { ExportTicketsQueryDto } from '../export/dto/export-tickets-query.dto';
import { isCreatedRangeOrdered } from './created-range.validator';

function errorsFor(cls: new () => object, query: Record<string, string>) {
  return validateSync(plainToInstance(cls, query)).flatMap((error) =>
    Object.keys(error.constraints ?? {}),
  );
}

describe('created range (5.3.1)', () => {
  it('accepts an ordered, equal or half-open range', () => {
    expect(isCreatedRangeOrdered('2026-10-01T00:00:00.000Z', '2026-10-08T23:59:59.999Z')).toBe(true);
    expect(isCreatedRangeOrdered('2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z')).toBe(true);
    expect(isCreatedRangeOrdered(undefined, '2026-10-08T00:00:00.000Z')).toBe(true);
    expect(isCreatedRangeOrdered('2026-10-08T00:00:00.000Z', undefined)).toBe(true);
  });

  it('compares instants, not strings (time zone offsets)', () => {
    // 01:00+02:00 is 23:00Z the previous day — before 23:30Z.
    expect(isCreatedRangeOrdered('2026-10-08T01:00:00+02:00', '2026-10-07T23:30:00Z')).toBe(true);
    expect(isCreatedRangeOrdered('2026-10-08T02:00:00+02:00', '2026-10-07T23:30:00Z')).toBe(false);
  });

  it('rejects an inverted range on the list and the export DTO', () => {
    const inverted = {
      createdFrom: '2026-10-08T00:00:00.000Z',
      createdTo: '2026-10-01T00:00:00.000Z',
    };
    expect(errorsFor(ListTicketsQueryDto, inverted)).toContain('createdRangeOrdered');
    expect(errorsFor(ExportTicketsQueryDto, inverted)).toContain('createdRangeOrdered');
    expect(
      errorsFor(ListTicketsQueryDto, { ...inverted, createdTo: '2026-10-09T00:00:00.000Z' }),
    ).not.toContain('createdRangeOrdered');
  });
});
