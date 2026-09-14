import { IntegrationJobType } from '../../generated/prisma/enums';
import { parseSettingsCsv } from '../notifications/email/parse-settings-csv';
import { integrationQueueTypeTokens } from './integration-queue.constants';

const tokenToJobType: Readonly<Record<string, IntegrationJobType>> = {
  [integrationQueueTypeTokens.email]: IntegrationJobType.EMAIL,
  [integrationQueueTypeTokens.edge]: IntegrationJobType.EDGE_EVENT,
  [integrationQueueTypeTokens.teams]: IntegrationJobType.TEAMS_STUB,
};

export function parseIntegrationQueueTypeTokens(
  value: unknown,
): ReadonlySet<string> {
  return new Set(parseSettingsCsv(value));
}

export function isQueuedIntegrationJobType(
  type: IntegrationJobType,
  typeTokens: ReadonlySet<string>,
): boolean {
  const token = Object.entries(tokenToJobType).find(
    ([, jobType]) => jobType === type,
  )?.[0];
  return token !== undefined && typeTokens.has(token);
}
