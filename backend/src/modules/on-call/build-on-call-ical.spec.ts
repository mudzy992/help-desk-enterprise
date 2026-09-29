import { buildOnCallIcal, escapeIcalText, foldIcalLine } from './build-on-call-ical';

describe('buildOnCallIcal (Paket 2.9 K3)', () => {
  it('builds a UTC feed with escaped text and CRLF', () => {
    const ics = buildOnCallIcal({
      calendarName: 'Dežurstva',
      generatedAt: new Date('2026-10-01T10:00:00Z'),
      events: [
        {
          uid: 's1-1772434800000@helpdesk',
          startsAt: new Date('2026-03-02T07:00:00Z'),
          endsAt: new Date('2026-03-09T07:00:00Z'),
          summary: 'Dežurstvo: IT, mreža',
          description: 'Grupa IT; smjena',
        },
      ],
    });
    expect(ics).toContain('\r\nDTSTART:20260302T070000Z\r\n');
    expect(ics).toContain('SUMMARY:Dežurstvo: IT\\, mreža');
    expect(ics).toContain('DESCRIPTION:Grupa IT\\; smjena');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('escapes and folds long lines at 75 octets', () => {
    expect(escapeIcalText('a\nb\\c')).toBe('a\\nb\\\\c');
    const folded = foldIcalLine(`SUMMARY:${'š'.repeat(60)}`);
    for (const line of folded.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'š'.repeat(60)}`);
  });
});
