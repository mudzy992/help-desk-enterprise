import { expect, test } from '@playwright/test';
import { formatInboundDiagnostics } from '../helpers/inbound-diagnostics';

test('inbound diagnostic reports only bounded known outcome fields', () => {
  expect(formatInboundDiagnostics([])).toBe('No inbound row matched this test message ID or unique subject.');
  expect(formatInboundDiagnostics([{ status: 'REJECTED', reason: 'UNKNOWN_SENDER', message_id_matches: true, subject_matches: true, has_created_ticket: false }]))
    .toBe('status=REJECTED reason=UNKNOWN_SENDER messageIdMatch=true subjectMatch=true createdTicket=false');
  const hostile = formatInboundDiagnostics([{ status: 'secret-status', reason: 'email-or-token', message_id_matches: null, subject_matches: false, has_created_ticket: false }]);
  expect(hostile).toBe('status=OTHER reason=OTHER messageIdMatch=false subjectMatch=false createdTicket=false');
});
