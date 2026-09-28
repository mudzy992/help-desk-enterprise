import { mkdtempSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildProcessingRecord, type SystemFacts } from './processing-record.service';
import { buildNoticeDraft, resolvePrivacyNotice } from './privacy-notice';
import { localizedPseudonym, periodLabel } from '../notices/privacy-mailer.service';
import { erasureTable } from '../notices/compose-privacy-email';
import { ErasureLedger } from '../anonymization/erasure-ledger';
import { decideReplay } from '../../../cli/privacy-replay';

const configuration = {
  enabled: true,
  retentionDays: { attachments: 0, ticketContent: 0, audit: 0, sessions: 90, emailDeliveries: 180, requestRegister: 0 },
  exportLinkValidDays: 7,
  controller: { name: 'JP Elektroprivreda BiH', address: '', dpoName: 'Amra H.', dpoEmail: 'dpo@epbih.ba', purpose: '', legalBasis: '' },
  notice: { bs: '', en: '' },
} as never;

const facts: SystemFacts = {
  smtpEnabled: true,
  smtpHost: 'smtp.office365.com',
  directoryEnabled: true,
  entraEnabled: false,
  mfaRequiredForAdmins: true,
  passwordMinLength: 12,
  activeUsers: 1500,
  tickets: 120000,
  anonymizedUsers: 3,
  openRequests: 1,
};
const now = new Date('2026-09-28T10:00:00Z');

describe('processing record (§8)', () => {
  it('builds every section, lists missing controller fields and real retention', () => {
    const record = buildProcessingRecord(configuration, facts, 'bs', now);
    expect(record.sections.map((s) => s.key)).toEqual([
      'controller', 'purpose', 'subjects', 'categories', 'recipients', 'retention', 'measures', 'stats',
    ]);
    expect(record.missing).toEqual(['address', 'purpose', 'legalBasis']);
    const retention = record.sections.find((s) => s.key === 'retention')!;
    expect(retention.rows.find((r) => r.label.startsWith('Sesije'))!.value).toBe('90 dana');
    expect(retention.rows.find((r) => r.label.startsWith('Prilozi'))!.value).toMatch(/isključeno/);
    const recipients = record.sections.find((s) => s.key === 'recipients')!;
    expect(recipients.rows[0].value).toMatch(/office365[\s\S]*izvan BiH/);
    expect(recipients.rows.find((r) => r.label === 'Microsoft Entra ID')!.value).toBe('isključeno');
    expect(buildProcessingRecord(configuration, facts, 'en', now).title).toMatch(/Record of processing/);
  });

  it('notice: saved text wins, other language is a fallback, otherwise a marked draft', async () => {
    const draftRecord = () => Promise.resolve(buildProcessingRecord(configuration, facts, 'bs', now));
    const saved = await resolvePrivacyNotice({ ...(configuration as object), notice: { bs: '# Naš tekst', en: '' } } as never, 'bs', draftRecord);
    expect(saved).toMatchObject({ markdown: '# Naš tekst', draft: false, fallbackLocale: false });
    const fallback = await resolvePrivacyNotice({ ...(configuration as object), notice: { bs: '# Naš tekst', en: '' } } as never, 'en', draftRecord);
    expect(fallback.fallbackLocale).toBe(true);
    const draft = await resolvePrivacyNotice(configuration, 'bs', draftRecord);
    expect(draft.draft).toBe(true);
    expect(draft.markdown.startsWith('> **NACRT: potvrditi s DPO.**')).toBe(true);
    expect(draft.markdown).toContain('30 dana');
    expect(draft.markdown).toContain('dpo@epbih.ba');
  });

  it('escapes markdown in admin-entered values', () => {
    const record = buildProcessingRecord(
      { ...(configuration as object), controller: { ...(configuration as { controller: object }).controller, name: '# Naslov\n- [x](javascript:alert(1))' } } as never,
      facts,
      'bs',
      now,
    );
    const draft = buildNoticeDraft(record);
    expect(draft).toContain('\\# Naslov; - \\[x\\](javascript:alert(1))');
    expect(draft).not.toMatch(/^# Naslov/m);
  });
});

describe('privacy e-mail helpers', () => {
  it('localizes the pseudonym and formats the week', () => {
    expect(localizedPseudonym('Bivši korisnik #7F3A', 'en')).toBe('Former user #7F3A');
    expect(localizedPseudonym('Bivši korisnik #7F3A12', 'bs')).toBe('Bivši korisnik #7F3A12');
    const slot = new Date('2026-09-28T05:00:00Z'); // Monday 07:00 Sarajevo
    const from = new Date(slot.getTime() - 7 * 86_400_000);
    expect(periodLabel(from, slot, 'Europe/Sarajevo', 'bs')).toBe('21. 9. – 28. 9. 2026.');
    expect(periodLabel(from, slot, 'Europe/Sarajevo', 'en')).toBe('21 Sep – 28 Sep 2026');
  });

  it('erasure table shows positive counts only, ids never', () => {
    const table = erasureTable('bs', { tickets: 3, sessions: 0, pausedScheduleIds: ['s1'], auditRedacted: 5 });
    expect(table.rows.map((r) => r.cells[0])).toEqual(['Tiketi (tekst)', 'Redigovani audit zapisi']);
  });
});

describe('erasure ledger and replay (§12)', () => {
  it('appends and reads entries; a torn line is counted, not fatal', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'ledger-')), 'l', 'erasures.jsonl');
    const ledger = new ErasureLedger(file);
    expect((await ledger.read()).entries).toEqual([]);
    const entry = {
      v: 1 as const,
      erasureId: 'e1',
      userId: 'u1',
      pseudonym: 'Bivši korisnik #AB12',
      tombstones: ['h'],
      deleteOwnAttachments: false,
      requestedByUserId: 'a1',
      completedAt: now.toISOString(),
    };
    await ledger.append(entry);
    appendFileSync(file, '{"v":1,"erasure');
    const read = await ledger.read();
    expect(read.entries).toEqual([entry]);
    expect(read.invalidLines).toBe(1);
  });

  it('decides what to replay', () => {
    expect(decideReplay(null)).toBe('user_missing');
    expect(decideReplay({ anonymizedAt: now })).toBe('already_anonymized');
    expect(decideReplay({ anonymizedAt: null })).toBe('replay');
  });
});
