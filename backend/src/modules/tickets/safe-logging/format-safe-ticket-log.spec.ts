import { redactedContentPlaceholder } from '../redaction/redaction.constants';
import {
  formatSafeTicketLog,
  redactConfidentialSnapshotFields,
} from './format-safe-ticket-log';
import { defaultTicketSafeLoggingConfiguration } from './safe-logging.constants';
import type { TicketRecord } from '../tickets.types';

const confidentialTicket = {
  id: 'ticket-1',
  ticketNumber: 'T-000001',
  title: 'Salary review for legal',
  description: 'Contains payroll amounts',
  status: 'PENDING',
  priority: 'MEDIUM',
  impact: 'MEDIUM',
  urgency: 'MEDIUM',
  classification: 'CONFIDENTIAL',
  isConfidential: true,
  formData: { note: 'secret-form' },
  originUnitId: 'ou-it',
  serviceId: 'service-vpn',
  formVersionId: 'form-1',
  requesterId: 'user-1',
  assignedGroupId: null,
  assignedUserId: null,
  parentTicketId: null,
  mergedIntoTicketId: null,
  reopenedFromTicketId: null,
  closeCodeId: null,
  resolutionNote: null,
  resolvedAt: null,
  closedAt: null,
  waitingForUserEnteredAt: null,
  waitingForUserReminderSentAt: null,
  firstResponseAt: null,
  createdAt: new Date('2026-09-11T12:00:00.000Z'),
  updatedAt: new Date('2026-09-11T12:00:00.000Z'),
} as TicketRecord;

describe('formatSafeTicketLog', () => {
  it('never writes secrets and omits confidential content', () => {
    const logged = formatSafeTicketLog(
      {
        ticketId: confidentialTicket.id,
        actorUserId: 'user-admin',
        action: 'ticket.view',
        classification: 'CONFIDENTIAL',
        isConfidential: true,
        title: confidentialTicket.title,
        description: confidentialTicket.description,
        body: 'internal note with payroll',
        password: 'hunter2',
        accessToken: 'tok-secret',
      },
      defaultTicketSafeLoggingConfiguration,
    );
    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain('Salary review');
    expect(serialized).not.toContain('payroll');
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('tok-secret');
    expect(logged.password).toBe('[REDACTED]');
    expect(logged.ticketId).toBe('ticket-1');
    expect(logged.actorUserId).toBe('user-admin');
  });

  it('redacts confidential change-log snapshots', () => {
    const snapshot = redactConfidentialSnapshotFields(confidentialTicket);
    expect(snapshot.title).toBe(redactedContentPlaceholder);
    expect(snapshot.description).toBe(redactedContentPlaceholder);
    expect(JSON.stringify(snapshot)).not.toContain('Salary review');
  });
});
