import type { AuthorizationContext } from '../authorization/authorization.types';
import { canSeeLegalHold, ticketPrivacyMarkers } from './privacy-markers';
import type { TicketRecord } from './tickets.types';

const context = (overrides: Partial<AuthorizationContext>, permissions: string[] = []): AuthorizationContext => ({
  subjectId: 'u-1',
  isLocalOnly: true,
  isSuperAdmin: false,
  assignments: [{ roleKey: 'AGENT', permissionKeys: permissions, organizationalUnitId: null, organizationalUnitPath: null, serviceId: null }],
  ...overrides,
});

describe('ticket privacy markers', () => {
  it('shows a legal hold only to privacy.view holders and SUPER_ADMIN', () => {
    expect(canSeeLegalHold(null)).toBe(false);
    expect(canSeeLegalHold(context({}))).toBe(false);
    expect(canSeeLegalHold(context({}, ['privacy.view']))).toBe(true);
    expect(canSeeLegalHold(context({ isSuperAdmin: true, assignments: [] }))).toBe(true);
  });

  it('hides the hold without permission but always explains purged attachments', () => {
    const record = {
      legalHoldAt: new Date('2026-01-01T00:00:00.000Z'),
      attachmentsPurgedAt: new Date('2026-02-01T00:00:00.000Z'),
    } as unknown as TicketRecord;
    expect(ticketPrivacyMarkers(record, false)).toEqual({ legalHold: false, attachmentsPurgedAt: '2026-02-01T00:00:00.000Z' });
    expect(ticketPrivacyMarkers(record, true)).toEqual({ legalHold: true, attachmentsPurgedAt: '2026-02-01T00:00:00.000Z' });
    expect(ticketPrivacyMarkers({} as TicketRecord, true)).toEqual({ legalHold: false, attachmentsPurgedAt: null });
  });
});
