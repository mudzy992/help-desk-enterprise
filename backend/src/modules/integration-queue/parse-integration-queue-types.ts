import { IntegrationJobType } from '../../generated/prisma/enums';
import { parseSettingsCsv } from '../notifications/email/parse-settings-csv';
import { integrationQueueTypeTokens } from './integration-queue.constants';

// Paket 3.1: the `teams` token queues the connector (TEAMS) and the legacy stub.
const tokenToJobTypes: Readonly<Record<string, readonly IntegrationJobType[]>> = {
  [integrationQueueTypeTokens.email]: [IntegrationJobType.EMAIL],
  [integrationQueueTypeTokens.edge]: [IntegrationJobType.EDGE_EVENT],
  [integrationQueueTypeTokens.teams]: [IntegrationJobType.TEAMS, IntegrationJobType.TEAMS_STUB],
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
  const token = Object.entries(tokenToJobTypes).find(([, jobTypes]) =>
    jobTypes.includes(type),
  )?.[0];
  return token !== undefined && typeTokens.has(token);
}
