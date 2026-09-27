import { buildWeeklyReportRows, composeWeeklyTicketReportEmail } from '../email/compose-weekly-ticket-report-email';
import { createEmailChannelTestConfiguration } from '../email/email-channel-test-configuration';
import type { TicketSlaClientSnapshot } from '../../tickets/tickets.types';
import { findPreferenceCategory } from './notification-preference-catalog';
import { defaultNotificationPreferencePolicy } from './notification-preference-policy';
import { validatePreferenceUpdate } from './notification-preferences.service';
import {
  buildWeeklyReportEntries,
  isoWeek,
  weeklyReportSlot,
  type WeeklyReportTicket,
} from './weekly-ticket-report';

jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

const tz = 'Europe/Sarajevo';
const now = new Date('2026-10-05T08:00:00Z'); // Monday 10:00 local
const day = 86_400_000;
const ticket = (id: string, overrides: Partial<WeeklyReportTicket> = {}): WeeklyReportTicket => ({
  id,
  ticketNumber: `HD-${id}`,
  title: `Title ${id}`,
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  isConfidential: false,
  createdAt: new Date(now.getTime() - 5 * day),
  updatedAt: new Date(now.getTime() - day),
  ...overrides,
});
const sla = (overrides: Partial<TicketSlaClientSnapshot>): TicketSlaClientSnapshot => ({
  slaProfileId: 'p',
  startedAt: new Date(now.getTime() - 5 * day).toISOString(),
  responseDueAt: null,
  resolutionDueAt: null,
  respondedAt: null,
  resolutionCompletedAt: null,
  pausedAt: null,
  isResponseBreached: false,
  isResolutionBreached: false,
  isResponseAtRisk: false,
  isResolutionAtRisk: false,
  ...overrides,
});

describe('weekly ticket report (paket 2.2a)', () => {
  it('finds the latest weekly slot in the installation zone, across DST', () => {
    expect(weeklyReportSlot(now, tz, 1, 420).toISOString()).toBe('2026-10-05T05:00:00.000Z');
    // Before Monday 07:00 → previous Monday.
    expect(weeklyReportSlot(new Date('2026-10-05T04:00:00Z'), tz, 1, 420).toISOString()).toBe(
      '2026-09-28T05:00:00.000Z',
    );
    // Monday after the October DST change: 07:00 local = 06:00 UTC.
    expect(weeklyReportSlot(new Date('2026-10-26T09:00:00Z'), tz, 1, 420).toISOString()).toBe(
      '2026-10-26T06:00:00.000Z',
    );
    expect(weeklyReportSlot(now, tz, 7, 420).toISOString()).toBe('2026-10-04T05:00:00.000Z');
    expect(isoWeek(now, tz)).toEqual({ year: 2026, week: 41 });
    expect(isoWeek(new Date('2027-01-01T10:00:00Z'), tz)).toEqual({ year: 2026, week: 53 });
  });

  it('keeps open tickets once, with the strongest role, overdue first then by priority and age', () => {
    const entries = buildWeeklyReportEntries({
      memberships: [
        { ticket: ticket('a'), role: 'WATCHER' },
        { ticket: ticket('a'), role: 'ASSIGNEE' },
        { ticket: ticket('b', { priority: 'HIGH' }), role: 'ASSIGNEE' },
        { ticket: ticket('c', { createdAt: new Date(now.getTime() - 9 * day) }), role: 'WATCHER' },
        { ticket: ticket('d', { status: 'RESOLVED' }), role: 'ASSIGNEE' },
        { ticket: ticket('e'), role: 'APPROVER' },
        { ticket: ticket('f', { status: 'PENDING_APPROVAL' }), role: 'APPROVER' },
        { ticket: ticket('g', { priority: 'LOW' }), role: 'WATCHER' },
      ],
      sla: new Map([
        ['g', sla({ resolutionDueAt: new Date(now.getTime() - 3_600_000).toISOString() })],
        ['b', sla({ isResolutionBreached: false, resolutionDueAt: new Date(now.getTime() + day).toISOString() })],
      ]),
      now,
    });
    expect(entries.map((entry) => [entry.ticket.id, entry.role, entry.section])).toEqual([
      ['g', 'WATCHER', 'overdue'],
      ['b', 'ASSIGNEE', 'assigned'],
      ['a', 'ASSIGNEE', 'assigned'],
      ['c', 'WATCHER', 'watching'],
      ['f', 'APPROVER', 'watching'],
    ]);
  });

  it('renders sections, hides confidential titles and caps the list', () => {
    const entries = buildWeeklyReportEntries({
      memberships: [
        { ticket: ticket('a', { isConfidential: true }), role: 'ASSIGNEE' },
        { ticket: ticket('b'), role: 'WATCHER' },
        { ticket: ticket('c'), role: 'WATCHER' },
      ],
      sla: new Map(),
      now,
    });
    const list = buildWeeklyReportRows({ entries, locale: 'bs', publicUrl: 'https://desk.epbih.ba', maxRows: 2, timeZone: tz, now });
    expect(list.rows.map((row) => [row.ticketNumber, row.title, row.section])).toEqual([
      ['HD-a', '', 'Dodijeljeni vama'],
      ['HD-b', 'Title b', 'Pratite / čeka vaše odobrenje'],
    ]);
    expect(list.rows[0]?.detail).toContain('otvoren 5 d');
    expect(list.more).toContain('1');
    const email = composeWeeklyTicketReportEmail({
      configuration: createEmailChannelTestConfiguration(),
      locale: 'en',
      recipientId: 'u1',
      recipientName: 'Amra',
      entries,
      maxRows: 100,
      timeZone: tz,
      week: isoWeek(now, tz),
      now,
      dedupeKey: 'weekly:2026-W41',
    });
    expect(email.subject).toContain('3');
    expect(email.html).toContain('Assigned to you');
    expect(email.text).toContain('Weekly review of the open tickets');
    expect(email.text).not.toContain('Title a');
    expect(email.headers['Auto-Submitted']).toBe('auto-generated');
  });

  it('is an e-mail-only category, locked by default and never in the digest', () => {
    expect(findPreferenceCategory('report.weeklyTickets')?.channels).toEqual({ inApp: false, email: true });
    expect(() =>
      validatePreferenceUpdate(
        { preferences: [{ category: 'report.weeklyTickets', email: 'DIGEST' }] },
        1,
        { ...defaultNotificationPreferencePolicy, lockedEmail: new Set() },
      ),
    ).toThrow(expect.objectContaining({ details: ['report.weeklyTickets: cannot be delivered in the digest'] }));
  });
});
