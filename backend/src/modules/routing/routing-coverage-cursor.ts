import { BadRequestException } from '@nestjs/common';

export type RoutingCoverageCursor = {
  readonly serviceName: string;
  readonly serviceId: string;
};

export function encodeRoutingCoverageCursor(
  cursor: RoutingCoverageCursor,
): string {
  return Buffer.from(
    JSON.stringify([cursor.serviceName, cursor.serviceId]),
    'utf8',
  ).toString('base64url');
}

export function decodeRoutingCoverageCursor(
  value: string | undefined,
): RoutingCoverageCursor | null {
  if (value === undefined) {
    return null;
  }
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    if (Buffer.from(decoded, 'utf8').toString('base64url') !== value) {
      throw new Error('Non-canonical cursor');
    }
    const parsed: unknown = JSON.parse(decoded);
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'string' ||
      typeof parsed[1] !== 'string' ||
      parsed[0].length === 0 ||
      parsed[1].length === 0
    ) {
      throw new Error('Invalid cursor payload');
    }
    return { serviceName: parsed[0], serviceId: parsed[1] };
  } catch {
    throw new BadRequestException({
      code: 'INVALID_ROUTING_COVERAGE_CURSOR',
      message: 'Routing coverage cursor is invalid',
    });
  }
}
