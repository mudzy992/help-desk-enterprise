import type { PrivacyConfiguration } from '../privacy-configuration.loader';
import type { ProcessingRecord, RecordLocale } from './processing-record.service';

export type PrivacyNotice = {
  readonly locale: RecordLocale;
  readonly markdown: string;
  /** True when no notice was saved: a draft generated from the record (§8). */
  readonly draft: boolean;
  /** The saved text of the other language was used (this one is empty). */
  readonly fallbackLocale: boolean;
};

const draftTexts = {
  bs: {
    banner: '> **NACRT: potvrditi s DPO.** Tekst je generisan iz evidencije obrade i nije pravno provjeren.',
    title: '# Obavještenje o obradi ličnih podataka',
    intro:
      'Ovo obavještenje objašnjava kako sistem za podršku (help desk) obrađuje vaše lične podatke, u skladu sa Zakonom o zaštiti ličnih podataka BiH (Službeni glasnik BiH 12/25).',
    rights: '## Vaša prava',
    rightsList: [
      'pristup podacima i kopija podataka (izvoz)',
      'ispravka netačnih podataka',
      'brisanje, kada za obradu više nema osnova',
      'ograničenje obrade i prigovor',
      'prenosivost podataka',
    ],
    answer:
      'Na zahtjev odgovaramo u roku od 30 dana (izuzetno produživo za još 60 dana, uz obavještenje). Postupanje je besplatno.',
    complaint:
      'Ako smatrate da su vaša prava povrijeđena, imate pravo podnijeti prigovor Agenciji za zaštitu ličnih podataka u BiH.',
    contact: '## Kontakt',
  },
  en: {
    banner: '> **DRAFT: to be confirmed with the DPO.** Generated from the record of processing; not legally reviewed.',
    title: '# Privacy notice',
    intro:
      'This notice explains how the help desk system processes your personal data, in line with the Personal Data Protection Act of Bosnia and Herzegovina (Official Gazette of BiH 12/25).',
    rights: '## Your rights',
    rightsList: [
      'access to your data and a copy (export)',
      'rectification of inaccurate data',
      'erasure, when there is no longer a basis for processing',
      'restriction of processing and objection',
      'data portability',
    ],
    answer:
      'We answer requests within 30 days (exceptionally extendable by 60 days, with notice). Handling is free of charge.',
    complaint:
      'If you believe your rights have been infringed, you may lodge a complaint with the Personal Data Protection Agency of BiH.',
    contact: '## Contact',
  },
} as const;

/** Markdown-safe single line (headings and list markers in values cannot restructure the notice). */
function inline(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/([\\`*_[\]<>#|])/g, '\\$1').trim();
}

export function buildNoticeDraft(record: ProcessingRecord): string {
  const t = draftTexts[record.locale];
  const lines: string[] = [t.banner, '', t.title, '', t.intro, ''];
  for (const key of ['controller', 'purpose', 'categories', 'recipients', 'retention'] as const) {
    const section = record.sections.find((item) => item.key === key);
    if (section === undefined) continue;
    lines.push(`## ${inline(section.title)}`, '');
    for (const row of section.rows) {
      const value = row.value.split('\n').map(inline).join('; ');
      lines.push(row.label.length > 0 ? `- **${inline(row.label)}:** ${value}` : `- ${value}`);
    }
    lines.push('');
  }
  lines.push(t.rights, '', ...t.rightsList.map((item) => `- ${item}`), '', t.answer, '', t.complaint, '');
  const controller = record.sections.find((item) => item.key === 'controller');
  if (controller !== undefined) {
    lines.push(t.contact, '', ...controller.rows.slice(2).map((row) => `- **${inline(row.label)}:** ${inline(row.value)}`), '');
  }
  return lines.join('\n');
}

export function resolvePrivacyNotice(
  configuration: PrivacyConfiguration,
  locale: RecordLocale,
  draft: () => Promise<ProcessingRecord>,
): Promise<PrivacyNotice> {
  const own = configuration.notice[locale].trim();
  if (own.length > 0) return Promise.resolve({ locale, markdown: own, draft: false, fallbackLocale: false });
  const other = configuration.notice[locale === 'bs' ? 'en' : 'bs'].trim();
  if (other.length > 0) return Promise.resolve({ locale, markdown: other, draft: false, fallbackLocale: true });
  return draft().then((record) => ({ locale, markdown: buildNoticeDraft(record), draft: true, fallbackLocale: false }));
}
