import { announcementErrorCodes, announcementLimits, AnnouncementError } from './announcements.constants';

const cursorVersion = 1;
const reportCursorPattern = /^[A-Za-z0-9_-]+$/;

type AnnouncementReportCursorEnvelope = Readonly<{
  v: typeof cursorVersion;
  announcementId: string;
  userId: string;
}>;

/** Encode a bounded, report-bound cursor so clients cannot accidentally reuse another report's page token. */
export function encodeAnnouncementReportCursor(announcementId: string, userId: string): string {
  return Buffer.from(
    JSON.stringify({ v: cursorVersion, announcementId, userId } satisfies AnnouncementReportCursorEnvelope),
    'utf8',
  ).toString('base64url');
}

/** Decode and validate a pending-report cursor before using its user ID in a keyset predicate. */
export function decodeAnnouncementReportCursor(
  cursor: string | null | undefined,
  announcementId: string,
): string | null {
  if (cursor === null || cursor === undefined) return null;
  try {
    if (
      cursor.length === 0 ||
      cursor.length > announcementLimits.reportPendingCursorMaxLength ||
      !reportCursorPattern.test(cursor)
    ) {
      return invalidCursor();
    }
    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.length > announcementLimits.reportPendingCursorMaxLength || decoded.toString('base64url') !== cursor) {
      return invalidCursor();
    }
    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalidCursor();
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !== 'announcementId,userId,v' ||
      record.v !== cursorVersion ||
      record.announcementId !== announcementId ||
      typeof record.userId !== 'string' ||
      record.userId.length === 0 ||
      record.userId.length > 255
    ) {
      return invalidCursor();
    }
    return record.userId;
  } catch (error) {
    if (error instanceof AnnouncementError) throw error;
    return invalidCursor();
  }
}

function invalidCursor(): never {
  throw new AnnouncementError(announcementErrorCodes.invalid, 'reportCursor');
}
