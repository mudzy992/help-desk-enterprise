import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createRetentionExecutors } from '../../privacy/retention/retention-executors';
import { resolveAttachmentUploadHardLimitBytes } from './attachments.constants';
import { parseTicketAttachmentConfiguration } from './parse-ticket-attachment-configuration';

describe('resolveAttachmentUploadHardLimitBytes (review S7)', () => {
  const mb = 1024 * 1024;
  it('defaults to 25 MB and honours ATTACHMENT_UPLOAD_MAX_MB within 1-100', () => {
    expect(resolveAttachmentUploadHardLimitBytes({})).toBe(25 * mb);
    expect(resolveAttachmentUploadHardLimitBytes({ ATTACHMENT_UPLOAD_MAX_MB: '10' })).toBe(10 * mb);
    expect(resolveAttachmentUploadHardLimitBytes({ ATTACHMENT_UPLOAD_MAX_MB: '500' })).toBe(100 * mb);
    expect(resolveAttachmentUploadHardLimitBytes({ ATTACHMENT_UPLOAD_MAX_MB: 'x' })).toBe(25 * mb);
  });
});

/**
 * Val 2 (M8/B1): `private.ticket.attachments.retentionDays` was read into the
 * attachment configuration, but no job ever applied it — deletion is owned by
 * the privacy module (`private.privacy.retention.attachmentsDays`, category
 * `attachments`). The dead field is gone; this test keeps it from coming back,
 * and pins down which setting really deletes attachments.
 */
describe('attachment retention has a single source (val 2, M8/B1)', () => {
  it('konfiguracija priloga ne nosi rok zadržavanja', () => {
    const parsed = parseTicketAttachmentConfiguration({
      enabled: true,
      maxFileSizeMb: 5,
      allowedMimeTypesCsv: 'image/png',
      allowedExtensionsCsv: 'png',
      maxFilesPerTicket: 3,
      maxFilesPerMessage: 2,
      dangerousExtensionsCsv: 'exe',
      // Stara postavka se ignoriše — drugi rok ne postoji.
      retentionDays: 30,
    } as never);

    expect(Object.keys(parsed).sort()).toEqual([
      'allowedExtensions',
      'allowedMimeTypes',
      'dangerousExtensions',
      'enabled',
      'maxFileSizeBytes',
      'maxFilesPerMessage',
      'maxFilesPerTicket',
    ]);
    expect('retentionDays' in parsed).toBe(false);
  });

  it('brisanje priloga pripada kategoriji `attachments` modula privatnosti', () => {
    // Dovoljna je sama konstrukcija: kategorija `attachments` postoji i briše
    // priloge zatvorenih tiketa; druga putanja brisanja ne postoji.
    const executors = createRetentionExecutors({} as never, {} as never);
    expect(Object.keys(executors).sort()).toEqual([
      'attachments',
      'audit',
      'emailDeliveries',
      'requestRegister',
      'sessions',
      'ticketContent',
    ]);
    expect(executors.attachments.category).toBe('attachments');
    const source = readFileSync(
      join(__dirname, '..', '..', 'settings', 'definitions', 'ticket-attachment-settings.ts'),
      'utf8',
    );
    // Postavka ostaje registrovana (obavještenje starim instalacijama), ali je
    // opis izričit: nema dejstva.
    expect(source).toContain('Deprecated and without effect');
  });
});
