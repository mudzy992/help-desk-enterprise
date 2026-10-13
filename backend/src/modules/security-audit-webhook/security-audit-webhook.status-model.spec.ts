import { buildAuditWebhookStatus } from './security-audit-webhook.status-model';

/*
  Paket 5.4.2 (stavka 4): the tile's state word and counters. Nothing here may
  carry the address, the secret or a response body - the model has no such field.
*/
describe('buildAuditWebhookStatus', () => {
  const now = new Date('2026-10-13T10:00:00.000Z');
  const row = {
    pendingSince: null,
    sentTotal: 12,
    failedTotal: 3,
    droppedTotal: 0,
    lastSuccessAt: new Date('2026-10-13T09:58:00.000Z'),
    lastErrorCode: null,
  };

  it('is disabled when the export is switched off, whatever the counters say', () => {
    expect(buildAuditWebhookStatus({ enabled: false, now, state: row })).toMatchObject({
      state: 'disabled',
      sentTotal: 12,
      pendingSince: null,
      pendingMinutes: null,
    });
  });

  it('is ok when enabled and nothing is pending', () => {
    expect(buildAuditWebhookStatus({ enabled: true, now, state: row })).toMatchObject({
      state: 'ok',
      lastSuccessAt: '2026-10-13T09:58:00.000Z',
      lastErrorCode: null,
    });
  });

  it('is failing with the minutes of the streak and the last error code', () => {
    const failing = {
      ...row,
      pendingSince: new Date('2026-10-13T09:30:00.000Z'),
      lastErrorCode: 'HTTP_500',
    };
    expect(buildAuditWebhookStatus({ enabled: true, now, state: failing })).toMatchObject({
      state: 'failing',
      pendingSince: '2026-10-13T09:30:00.000Z',
      pendingMinutes: 30,
      lastErrorCode: 'HTTP_500',
    });
  });

  it('does not report a streak while the export is off, even with a leftover mark', () => {
    const leftover = { ...row, pendingSince: new Date('2026-10-13T09:30:00.000Z') };
    expect(buildAuditWebhookStatus({ enabled: false, now, state: leftover })).toMatchObject({
      state: 'disabled',
      pendingSince: null,
      pendingMinutes: null,
    });
  });

  it('reads zeros when the state row does not exist yet', () => {
    expect(buildAuditWebhookStatus({ enabled: true, now, state: null })).toEqual({
      state: 'ok',
      pendingSince: null,
      pendingMinutes: null,
      sentTotal: 0,
      failedTotal: 0,
      droppedTotal: 0,
      lastSuccessAt: null,
      lastErrorCode: null,
      generatedAt: '2026-10-13T10:00:00.000Z',
    });
  });
});
