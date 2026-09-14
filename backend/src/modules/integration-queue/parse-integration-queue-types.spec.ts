import { IntegrationJobType } from '../../generated/prisma/enums';
import {
  isQueuedIntegrationJobType,
  parseIntegrationQueueTypeTokens,
} from './parse-integration-queue-types';

describe('parseIntegrationQueueTypeTokens', () => {
  it('maps csv tokens to queued job types', () => {
    const tokens = parseIntegrationQueueTypeTokens('email, edge');
    expect(tokens.has('email')).toBe(true);
    expect(tokens.has('edge')).toBe(true);
    expect(
      isQueuedIntegrationJobType(IntegrationJobType.EMAIL, tokens),
    ).toBe(true);
    expect(
      isQueuedIntegrationJobType(IntegrationJobType.TEAMS_STUB, tokens),
    ).toBe(false);
  });
});
