import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TemplatesCursorQueryDto } from './templates.dto';

function errors(value: Record<string, unknown>) {
  return validateSync(plainToInstance(TemplatesCursorQueryDto, value));
}

describe('TemplatesCursorQueryDto', () => {
  it('transforms and accepts an in-range integer page size and cursor', () => {
    expect(errors({ take: '25', cursor: 'cursor-v1' })).toEqual([]);
    expect(errors({})).toEqual([]);
  });

  it.each(['0', '-1', '101', '1.5', 'not-a-number'])('rejects take=%s', (take) => {
    expect(errors({ take }).some((error) => error.property === 'take')).toBe(true);
  });

  it('rejects cursors outside the bounded string size and non-string cursors', () => {
    expect(errors({ cursor: 'x'.repeat(1025) }).some((error) => error.property === 'cursor')).toBe(true);
    expect(errors({ cursor: 42 }).some((error) => error.property === 'cursor')).toBe(true);
  });
});
