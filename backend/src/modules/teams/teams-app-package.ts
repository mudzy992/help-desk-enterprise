import { defaultAppName } from '../branding/branding.constants';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';

/**
 * Paket 3.1 (§17): the Teams app package (manifest + two icons). Icons are a
 * generated monogram (no logo setting exists), so nothing branded is
 * hardcoded: the letter comes from the application name setting.
 */
export const teamsManifestSchemaVersion = '1.19';
export const teamsManifestSchemaUrl = `https://developer.microsoft.com/en-us/json-schemas/teams/v${teamsManifestSchemaVersion}/MicrosoftTeams.schema.json`;
export const teamsAppVersion = '1.0.0';
const monogramColor: readonly [number, number, number] = [79, 70, 229]; // default (pulse indigo) theme

export interface TeamsManifestInput {
  readonly botAppId: string;
  readonly appName: string;
  readonly publicUrl: string;
  readonly locale: 'bs' | 'en';
}

const copy = {
  bs: {
    short: 'Help desk u Teamsu',
    full: 'Obavijesti o tiketima, odobrenja, CAB glasanje i prijava tiketa direktno iz Microsoft Teamsa.',
    createFromMessage: 'Kreiraj tiket iz poruke',
    createFromMessageDescription: 'Prijavi tiket s tekstom ove poruke',
    // §20b: Teams allows 10 commands per list; `cab` and `dežurni` work when typed and appear in `pomoć`.
    commands: [
      ['pomoć', 'Šta bot zna'],
      ['novi tiket', 'Prijava novog tiketa'],
      ['moji tiketi', 'Vaši otvoreni tiketi'],
      ['tiket', 'Kartica tiketa, npr. tiket HD-123'],
      ['traži', 'Pretraga baze znanja, npr. traži vpn'],
      ['odobrenja', 'Odobrenja koja čekaju vas'],
      ['status', 'Prekidi i planirani radovi'],
      ['dodijeljeni', 'Agenti: vaši tiketi po SLA roku'],
      ['red', 'Agenti: nepreuzeti tiketi grupa'],
      ['sla', 'Agenti: ugroženi i probijeni SLA rokovi'],
    ],
    teamCommands: [
      ['poveži', 'Poveži kanal s grupom'],
      ['odspoji', 'Ukloni vezu kanala s grupom'],
      ['pomoć', 'Šta bot zna'],
    ],
  },
  en: {
    short: 'Help desk in Teams',
    full: 'Ticket notifications, approvals, CAB voting and ticket reporting directly from Microsoft Teams.',
    createFromMessage: 'Create ticket from message',
    createFromMessageDescription: 'Report a ticket with the text of this message',
    commands: [
      ['help', 'What the bot can do'],
      ['new ticket', 'Report a new ticket'],
      ['my tickets', 'Your open tickets'],
      ['ticket', 'Ticket card, e.g. ticket HD-123'],
      ['search', 'Knowledge base search, e.g. search vpn'],
      ['approvals', 'Approvals waiting for you'],
      ['status', 'Outages and planned maintenance'],
      ['assigned', 'Agents: your tickets by SLA deadline'],
      ['queue', 'Agents: unclaimed tickets of your groups'],
      ['sla', 'Agents: at-risk and breached SLA deadlines'],
    ],
    teamCommands: [
      ['link', 'Link the channel to a group'],
      ['unlink', 'Remove the channel link'],
      ['help', 'What the bot can do'],
    ],
  },
} as const;

export function buildTeamsManifest(input: TeamsManifestInput): Record<string, unknown> {
  const text = copy[input.locale];
  const host = new URL(input.publicUrl).host;
  const name = input.appName.slice(0, 30) || defaultAppName;
  return {
    $schema: teamsManifestSchemaUrl,
    manifestVersion: teamsManifestSchemaVersion,
    version: teamsAppVersion,
    id: input.botAppId,
    developer: {
      name: name,
      websiteUrl: input.publicUrl,
      privacyUrl: `${input.publicUrl}/privacy-notice`,
      // No separate terms page exists; the public privacy notice covers both.
      termsOfUseUrl: `${input.publicUrl}/privacy-notice`,
    },
    name: { short: name, full: input.appName.slice(0, 100) || name },
    description: { short: text.short, full: text.full },
    icons: { color: 'color.png', outline: 'outline.png' },
    accentColor: '#4F46E5',
    bots: [
      {
        botId: input.botAppId,
        scopes: ['personal', 'team'],
        supportsFiles: false,
        isNotificationOnly: false,
        commandLists: [
          { scopes: ['personal'], commands: text.commands.map(([title, description]) => ({ title, description })) },
          { scopes: ['team'], commands: text.teamCommands.map(([title, description]) => ({ title, description })) },
        ],
      },
    ],
    composeExtensions: [
      {
        botId: input.botAppId,
        commands: [
          {
            id: 'createTicketFromMessage',
            type: 'action',
            title: text.createFromMessage,
            description: text.createFromMessageDescription,
            context: ['message'],
            fetchTask: true,
          },
        ],
      },
    ],
    permissions: ['identity', 'messageTeamMembers'],
    validDomains: [host],
    webApplicationInfo: { id: input.botAppId, resource: `api://${host}/${input.botAppId}` },
  };
}

/** Minimal manifest checks mirroring the schema rules we rely on (no network schema fetch). */
export function validateTeamsManifest(manifest: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guid.test(String(manifest.id))) problems.push('id must be the bot App ID (GUID)');
  if (!/^\d+\.\d+\.\d+$/.test(String(manifest.version))) problems.push('version must be semver');
  const name = manifest.name as { short?: string; full?: string };
  if (!name?.short || name.short.length > 30) problems.push('name.short must have 1–30 characters');
  const description = manifest.description as { short?: string; full?: string };
  if (!description?.short || description.short.length > 80) problems.push('description.short must have 1–80 characters');
  if (!description?.full || description.full.length > 4000) problems.push('description.full must have 1–4000 characters');
  const domains = manifest.validDomains as string[];
  if (!Array.isArray(domains) || domains.some((domain) => domain.includes('/') || domain.includes(':'))) problems.push('validDomains must be bare host names');
  const developer = manifest.developer as Record<string, string>;
  for (const key of ['websiteUrl', 'privacyUrl', 'termsOfUseUrl']) if (!String(developer?.[key]).startsWith('https://')) problems.push(`developer.${key} must be https`);
  const bots = (manifest.bots ?? []) as { commandLists?: { commands?: { title?: string; description?: string }[] }[] }[];
  for (const list of bots.flatMap((bot) => bot.commandLists ?? [])) {
    const commands = list.commands ?? [];
    if (commands.length > 10) problems.push('a command list may have at most 10 commands');
    for (const command of commands) {
      if (!command.title || command.title.length > 32) problems.push('command titles must have 1–32 characters');
      if (!command.description || command.description.length > 128) problems.push('command descriptions must have 1–128 characters');
    }
  }
  return problems;
}

export async function buildTeamsAppPackage(input: TeamsManifestInput): Promise<Buffer> {
  const zip = new JSZip();
  const letter = initialOf(input.appName);
  zip.file('manifest.json', `${JSON.stringify(buildTeamsManifest(input), null, 2)}\n`);
  zip.file('color.png', monogramPng(192, letter, 'color'));
  zip.file('outline.png', monogramPng(32, letter, 'outline'));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function initialOf(name: string): string {
  const letter = name.trim().charAt(0).toUpperCase();
  return glyphs[letter] ? letter : glyphs[stripDiacritics(letter)] ? stripDiacritics(letter) : 'H';
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace('Đ', 'D');
}

// 5×7 bitmap font for the monogram letter.
const glyphs: Record<string, readonly string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
};

/**
 * RGBA PNG: `color` = white letter on the theme colour; `outline` = white
 * letter on transparent background (Teams requires white + transparent only).
 */
export function monogramPng(size: number, letter: string, variant: 'color' | 'outline'): Buffer {
  const glyph = glyphs[letter] ?? glyphs.H!;
  const scale = Math.floor((size * 0.6) / 7);
  const left = Math.floor((size - 5 * scale) / 2);
  const top = Math.floor((size - 7 * scale) / 2);
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const gx = Math.floor((x - left) / scale);
      const gy = Math.floor((y - top) / scale);
      const on = x >= left && y >= top && gx < 5 && gy < 7 && glyph[gy]?.[gx] === '1';
      const offset = 1 + x * 4;
      if (on) row.set([255, 255, 255, 255], offset);
      else if (variant === 'color') row.set([...monogramColor, 255], offset);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
