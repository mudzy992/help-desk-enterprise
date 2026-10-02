/** Paket 3.1 (§7, §20b): bot commands; Bosnian and English aliases, case and diacritics insensitive. */
export type TeamsCommand =
  | 'help'
  | 'newTicket'
  | 'myTickets'
  | 'link'
  | 'unlink'
  | 'ticket'
  | 'search'
  | 'approvals'
  | 'status'
  | 'assigned'
  | 'queue'
  | 'sla'
  | 'cab'
  | 'onCall'
  | 'unknown';

/** Commands only staff (AGENT, ADMIN, SUPER_ADMIN) can use (§20b.1). */
export const teamsAgentCommands: ReadonlySet<TeamsCommand> = new Set<TeamsCommand>(['assigned', 'queue', 'sla', 'cab', 'onCall']);

export interface ParsedTeamsCommand {
  readonly command: TeamsCommand;
  /** Text after the command word (`tiket HD-1` → `HD-1`, `traži vpn` → `vpn`), original case, trimmed. */
  readonly argument: string;
}

/** Whole-text commands (no argument). Compared after normalisation. */
const aliases: Partial<Record<TeamsCommand, readonly string[]>> = {
  help: ['pomoc', 'help', '?'],
  newTicket: ['novi tiket', 'new ticket', 'novi', 'new'],
  myTickets: ['moji tiketi', 'my tickets', 'tiketi', 'tickets'],
  link: ['povezi', 'link'],
  unlink: ['odspoji', 'unlink'],
  approvals: ['odobrenja', 'approvals'],
  status: ['status', 'prekidi', 'outages'],
  assigned: ['dodijeljeni', 'dodjeljeni', 'assigned', 'moji zadaci'],
  queue: ['red', 'queue', 'inbox'],
  sla: ['sla'],
  cab: ['cab', 'promjene', 'changes'],
  onCall: ['dezurni', 'dezurstvo', 'on-call', 'oncall', 'on call'],
};

/** Commands followed by an argument (first word(s), normalised). */
const prefixed: ReadonlyArray<readonly [TeamsCommand, readonly string[]]> = [
  ['ticket', ['tiket', 'ticket']],
  ['search', ['trazi', 'search', 'kb', 'pretraga']],
];

/** A bare ticket reference: letters, optional dash, then digits (e.g. `HD-123`, `INC2026-0042`). */
const bareTicketReference = /^[a-z][a-z0-9]{0,15}-?\d[a-z0-9-]{0,30}$/i;

/** Removes `<at>…</at>` mentions, HTML tags and diacritics; collapses whitespace. */
export function normalizeCommandText(text: string | undefined): string {
  return stripMarkup(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'dj')
    .replace(/Đ/g, 'Dj')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMarkup(text: string | undefined): string {
  return (text ?? '')
    .replace(/<at>.*?<\/at>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTeamsInput(text: string | undefined): ParsedTeamsCommand {
  const normalized = normalizeCommandText(text);
  for (const [command, words] of Object.entries(aliases) as [TeamsCommand, readonly string[]][]) {
    if (words.includes(normalized)) return { command, argument: '' };
  }
  const original = stripMarkup(text);
  for (const [command, words] of prefixed) {
    for (const word of words) {
      if (normalized.startsWith(`${word} `)) {
        // The prefix has the same number of characters before and after normalisation (ASCII + stripped marks).
        const argument = original.slice(original.search(/\s/) + 1).trim().slice(0, 200);
        if (argument.length > 0) return { command, argument };
      }
      if (normalized === word) return { command, argument: '' };
    }
  }
  if (bareTicketReference.test(normalized)) return { command: 'ticket', argument: original };
  return { command: 'unknown', argument: '' };
}

export function parseTeamsCommand(text: string | undefined): TeamsCommand {
  return parseTeamsInput(text).command;
}

/** True when the reference came without the `tiket` word (unknown numbers then fall back to help). */
export function isBareTicketReference(text: string | undefined): boolean {
  return bareTicketReference.test(normalizeCommandText(text));
}
