import { createHmac, timingSafeEqual } from 'node:crypto';
import { TeamsError } from './teams.error';

/** Paket 3.1: inbound simulator activities are signed with TEAMS_SIMULATOR_SECRET. */
export const simulatorSignatureHeader = 'x-teams-simulator-signature';
export const simulatorTimestampHeader = 'x-teams-simulator-timestamp';
const maxSkewMs = 5 * 60_000;
const minimumSecretLength = 32;

export function signSimulatorActivity(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
}

export function verifySimulatorActivity(input: {
  secret: string | undefined;
  signature: string | undefined;
  timestamp: string | undefined;
  rawBody: string;
  now?: number;
}): void {
  const secret = input.secret ?? '';
  if (secret.length < minimumSecretLength) throw new TeamsError('NOT_CONFIGURED', `TEAMS_SIMULATOR_SECRET must have at least ${minimumSecretLength} characters`);
  const timestampMs = Number(input.timestamp) * 1000;
  if (!input.timestamp || !Number.isFinite(timestampMs) || Math.abs((input.now ?? Date.now()) - timestampMs) > maxSkewMs) throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'Stale or missing timestamp');
  const expected = Buffer.from(signSimulatorActivity(secret, input.timestamp, input.rawBody));
  const actual = Buffer.from(input.signature ?? '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new TeamsError('UNAUTHORIZED_ACTIVITY', 'Bad simulator signature');
}

export function isSimulatorSecretConfigured(secret: string | undefined): boolean {
  return (secret ?? '').length >= minimumSecretLength;
}
