import { configVersioningErrorCodes } from './config-versioning.constants';
import { assertConfigVersionReadyForActivation } from './assert-config-version-ready-for-activation';

describe('assertConfigVersionReadyForActivation', () => {
  it.each(['VALIDATED', 'SHADOW'])('allows %s', (status) => {
    expect(() => assertConfigVersionReadyForActivation(status)).not.toThrow();
  });

  it.each(['DRAFT', 'ACTIVE', 'ROLLED_BACK'])('rejects %s', (status) => {
    expect(() => assertConfigVersionReadyForActivation(status)).toThrow(
      expect.objectContaining({ code: configVersioningErrorCodes.validationFailed }),
    );
  });
});
