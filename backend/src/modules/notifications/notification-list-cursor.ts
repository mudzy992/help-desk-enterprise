import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

export type NotificationListCursor = {
  readonly createdAt: Date;
  readonly id: string;
};

type EncodedNotificationListCursor = {
  readonly kind: 'notifications-inbox-v1';
  readonly createdAt: string;
  readonly id: string;
  readonly filterKey: string;
};

const notificationListCursorKind = 'notifications-inbox-v1';
const notificationListCursorMaximumLength = 1024;

export function encodeNotificationListCursor(
  cursor: NotificationListCursor,
  userId: string,
  unreadOnly: boolean,
): string {
  const value: EncodedNotificationListCursor = {
    kind: notificationListCursorKind,
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
    filterKey: notificationListFilterKey(userId, unreadOnly),
  };
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeNotificationListCursor(
  value: string | undefined,
  userId: string,
  unreadOnly: boolean,
): NotificationListCursor | null {
  if (value === undefined) return null;
  if (value.length === 0 || value.length > notificationListCursorMaximumLength) {
    throw invalidNotificationListCursor();
  }

  try {
    const decodedText = Buffer.from(value, 'base64url').toString('utf8');
    if (Buffer.from(decodedText, 'utf8').toString('base64url') !== value) {
      throw invalidNotificationListCursor();
    }

    const decoded: unknown = JSON.parse(decodedText);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      Array.isArray(decoded) ||
      !('kind' in decoded) ||
      !('createdAt' in decoded) ||
      !('id' in decoded) ||
      !('filterKey' in decoded) ||
      decoded.kind !== notificationListCursorKind ||
      typeof decoded.createdAt !== 'string' ||
      !isCanonicalTimestamp(decoded.createdAt) ||
      typeof decoded.id !== 'string' ||
      decoded.id.length === 0 ||
      decoded.id.length > 255 ||
      decoded.filterKey !== notificationListFilterKey(userId, unreadOnly)
    ) {
      throw invalidNotificationListCursor();
    }

    return { createdAt: new Date(decoded.createdAt), id: decoded.id };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw invalidNotificationListCursor();
  }
}

function notificationListFilterKey(userId: string, unreadOnly: boolean): string {
  return createHash('sha256').update(JSON.stringify({ userId, unreadOnly })).digest('hex');
}

function isCanonicalTimestamp(value: string): boolean {
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value;
}

function invalidNotificationListCursor(): BadRequestException {
  return new BadRequestException('INVALID_NOTIFICATION_CURSOR');
}
