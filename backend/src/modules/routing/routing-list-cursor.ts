import { BadRequestException } from '@nestjs/common';

export type RoutingRuleCursor = {
  readonly serviceId: string;
  readonly originUnitId: string;
  readonly id: string;
};

export type RoutingChangeCursor = {
  readonly createdAt: string;
  readonly id: string;
};

type RoutingListCursor =
  | ({ readonly kind: 'rule' } & RoutingRuleCursor)
  | ({ readonly kind: 'change' } & RoutingChangeCursor);

export function encodeRoutingListCursor(cursor: RoutingListCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeRoutingRuleCursor(cursor?: string): RoutingRuleCursor | null {
  const decoded = decode(cursor);
  if (
    decoded === null ||
    decoded.kind !== 'rule' ||
    !isString(decoded.serviceId) ||
    !isString(decoded.originUnitId) ||
    !isString(decoded.id)
  ) {
    if (cursor === undefined) return null;
    throw invalidCursor();
  }
  return {
    serviceId: decoded.serviceId,
    originUnitId: decoded.originUnitId,
    id: decoded.id,
  };
}

export function decodeRoutingChangeCursor(cursor?: string): RoutingChangeCursor | null {
  const decoded = decode(cursor);
  if (
    decoded === null ||
    decoded.kind !== 'change' ||
    !isString(decoded.createdAt) ||
    Number.isNaN(Date.parse(decoded.createdAt)) ||
    !isString(decoded.id)
  ) {
    if (cursor === undefined) return null;
    throw invalidCursor();
  }
  return { createdAt: decoded.createdAt, id: decoded.id };
}

function decode(cursor?: string): Record<string, unknown> | null {
  if (cursor === undefined) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return typeof value === 'object' && value !== null
      ? value as Record<string, unknown>
      : null;
  } catch {
    throw invalidCursor();
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function invalidCursor(): BadRequestException {
  return new BadRequestException('INVALID_ROUTING_LIST_CURSOR');
}
