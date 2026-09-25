import { resolveAttachmentUploadHardLimitBytes } from './attachments.constants';

describe('resolveAttachmentUploadHardLimitBytes (review S7)', () => {
  const mb = 1024 * 1024;
  it('defaults to 25 MB and honours ATTACHMENT_UPLOAD_MAX_MB within 1-100', () => {
    expect(resolveAttachmentUploadHardLimitBytes({})).toBe(25 * mb);
    expect(resolveAttachmentUploadHardLimitBytes({ ATTACHMENT_UPLOAD_MAX_MB: '10' })).toBe(10 * mb);
    expect(resolveAttachmentUploadHardLimitBytes({ ATTACHMENT_UPLOAD_MAX_MB: '500' })).toBe(100 * mb);
    expect(resolveAttachmentUploadHardLimitBytes({ ATTACHMENT_UPLOAD_MAX_MB: 'x' })).toBe(25 * mb);
  });
});
