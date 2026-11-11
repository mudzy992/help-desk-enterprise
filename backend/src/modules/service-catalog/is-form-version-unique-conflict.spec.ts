import { isFormVersionUniqueConflict } from './is-form-version-unique-conflict';

describe('isFormVersionUniqueConflict', () => {
  it('recognizes Prisma P2002 for the service/version key', () => {
    expect(
      isFormVersionUniqueConflict({
        code: 'P2002',
        meta: { target: ['serviceId', 'version'] },
      }),
    ).toBe(true);
    expect(
      isFormVersionUniqueConflict({
        code: 'P2002',
        meta: { constraint: 'FormVersion_serviceId_version_key' },
      }),
    ).toBe(true);
  });

  it('does not map unrelated or unclassified provider errors', () => {
    expect(
      isFormVersionUniqueConflict({
        code: 'P2002',
        meta: { target: ['id'] },
      }),
    ).toBe(false);
    expect(
      isFormVersionUniqueConflict({
        code: 'P2003',
        meta: { target: ['serviceId'] },
      }),
    ).toBe(false);
    expect(isFormVersionUniqueConflict(new Error('database unavailable'))).toBe(
      false,
    );
  });
});
