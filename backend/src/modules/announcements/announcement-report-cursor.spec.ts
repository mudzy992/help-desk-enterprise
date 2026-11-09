import { announcementErrorCodes, AnnouncementError } from './announcements.constants';
import { decodeAnnouncementReportCursor, encodeAnnouncementReportCursor } from './announcement-report-cursor';

describe('announcement report cursor', () => {
  it('round-trips a user ID bound to its announcement', () => {
    const cursor = encodeAnnouncementReportCursor('announcement-1', 'user-200');

    expect(decodeAnnouncementReportCursor(cursor, 'announcement-1')).toBe('user-200');
  });

  it('rejects a cursor reused for another announcement', () => {
    const cursor = encodeAnnouncementReportCursor('announcement-1', 'user-200');

    expect(() => decodeAnnouncementReportCursor(cursor, 'announcement-2')).toThrow(announcementErrorCodes.invalid);
  });

  it('rejects malformed and non-canonical tokens', () => {
    expect(() => decodeAnnouncementReportCursor('not a cursor', 'announcement-1')).toThrow(AnnouncementError);
    expect(() => decodeAnnouncementReportCursor('', 'announcement-1')).toThrow(AnnouncementError);
  });
});
