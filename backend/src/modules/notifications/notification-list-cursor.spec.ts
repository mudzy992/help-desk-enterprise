import { BadRequestException } from '@nestjs/common';
import {
  decodeNotificationListCursor,
  encodeNotificationListCursor,
} from './notification-list-cursor';

describe('notification list cursor', () => {
  const createdAt = new Date('2026-11-06T10:20:30.123Z');
  const cursor = { createdAt, id: 'notification-1' };

  it('round-trips the stable keyset for the same user and filter', () => {
    const encoded = encodeNotificationListCursor(cursor, 'user-1', false);

    expect(decodeNotificationListCursor(encoded, 'user-1', false)).toEqual(cursor);
  });

  it('rejects cursors reused for a different user or unread filter', () => {
    const encoded = encodeNotificationListCursor(cursor, 'user-1', false);

    expect(() => decodeNotificationListCursor(encoded, 'user-2', false)).toThrow(
      BadRequestException,
    );
    expect(() => decodeNotificationListCursor(encoded, 'user-1', true)).toThrow(
      BadRequestException,
    );
  });

  it('rejects malformed, non-canonical and invalid-payload cursors', () => {
    const malformedTimestamp = Buffer.from(
      JSON.stringify({
        kind: 'notifications-inbox-v1',
        createdAt: 'not-a-timestamp',
        id: 'notification-1',
        filterKey: 'unused',
      }),
      'utf8',
    ).toString('base64url');

    expect(() => decodeNotificationListCursor('not-a-cursor', 'user-1', false)).toThrow(
      BadRequestException,
    );
    expect(() =>
      decodeNotificationListCursor(
        `${encodeNotificationListCursor(cursor, 'user-1', false)}=`,
        'user-1',
        false,
      ),
    ).toThrow(BadRequestException);
    expect(() => decodeNotificationListCursor(malformedTimestamp, 'user-1', false)).toThrow(
      BadRequestException,
    );
    expect(() => decodeNotificationListCursor('', 'user-1', false)).toThrow(BadRequestException);
  });
});
