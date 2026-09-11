import { changeLogErrorCodes } from './change-log.constants';
import { ChangeLogError } from './change-log.error';
import { requireChangeReason } from './require-change-reason';

describe('requireChangeReason', () => {
  it('rejects missing, blank, and oversized reasons', () => {
    expect(() => requireChangeReason(undefined)).toThrow(ChangeLogError);
    expect(() => requireChangeReason('   ')).toThrow(ChangeLogError);
    expect(() => requireChangeReason('x'.repeat(513))).toThrow(ChangeLogError);
    try {
      requireChangeReason('');
    } catch (error) {
      expect(error).toMatchObject({ code: changeLogErrorCodes.reasonRequired });
    }
    expect(requireChangeReason('  Rotate signing key  ')).toBe(
      'Rotate signing key',
    );
  });
});
