/** Paket 3.1 (§7): bot commands; Bosnian and English aliases, case and diacritics insensitive. */
export type TeamsCommand = 'help' | 'newTicket' | 'myTickets' | 'link' | 'unlink' | 'unknown';

const aliases: Record<Exclude<TeamsCommand, 'unknown'>, readonly string[]> = {
  help: ['pomoc', 'help', '?'],
  newTicket: ['novi tiket', 'new ticket', 'novi', 'new'],
  myTickets: ['moji tiketi', 'my tickets', 'tiketi', 'tickets'],
  link: ['povezi', 'link'],
  unlink: ['odspoji', 'unlink'],
};

/** Removes `<at>…</at>` mentions, HTML tags and diacritics; collapses whitespace. */
export function normalizeCommandText(text: string | undefined): string {
  return (text ?? '')
    .replace(/<at>.*?<\/at>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'dj')
    .replace(/Đ/g, 'Dj')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseTeamsCommand(text: string | undefined): TeamsCommand {
  const normalized = normalizeCommandText(text);
  for (const [command, words] of Object.entries(aliases) as [Exclude<TeamsCommand, 'unknown'>, readonly string[]][]) {
    if (words.includes(normalized)) return command;
  }
  return 'unknown';
}
