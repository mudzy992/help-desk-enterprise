/*
  Paket 2.9 (K3, §4.6): minimal RFC 5545 feed of the user's own shifts.
  UTC times only (no VTIMEZONE needed), CRLF line endings, lines folded at
  75 octets, text escaped. UIDs are stable per shift so calendar clients
  update instead of duplicating.
*/

export type OnCallIcalEvent = {
  readonly uid: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly summary: string;
  readonly description: string;
};

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function foldIcalLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character, 'utf8');
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + size > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildOnCallIcal(input: {
  readonly calendarName: string;
  readonly events: readonly OnCallIcalEvent[];
  readonly generatedAt: Date;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//help-desk-enterprise//on-call//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcalText(input.calendarName)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const event of input.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${formatUtc(input.generatedAt)}`,
      `DTSTART:${formatUtc(event.startsAt)}`,
      `DTEND:${formatUtc(event.endsAt)}`,
      `SUMMARY:${escapeIcalText(event.summary)}`,
      `DESCRIPTION:${escapeIcalText(event.description)}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcalLine).join('\r\n')}\r\n`;
}
