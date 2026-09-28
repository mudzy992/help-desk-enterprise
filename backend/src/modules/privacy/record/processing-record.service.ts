import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { settingKeys } from '../../settings/setting-keys';
import { PrivacyConfigurationLoader, type PrivacyConfiguration } from '../privacy-configuration.loader';
import { closedRequestStatuses, retentionCategories, type RetentionCategory } from '../privacy.constants';

export type RecordLocale = 'bs' | 'en';

export type ProcessingRecordSection = {
  readonly key: string;
  readonly title: string;
  /** Label/value rows; `value` may contain line breaks. */
  readonly rows: readonly { readonly label: string; readonly value: string }[];
};

export type ProcessingRecord = {
  readonly locale: RecordLocale;
  readonly generatedAt: string;
  readonly title: string;
  /** Fields the admin still has to fill in (settings `private.privacy.controller.*`). */
  readonly missing: readonly string[];
  readonly sections: readonly ProcessingRecordSection[];
};

export type SystemFacts = {
  readonly smtpEnabled: boolean;
  readonly smtpHost: string | null;
  readonly directoryEnabled: boolean;
  readonly entraEnabled: boolean;
  readonly mfaRequiredForAdmins: boolean;
  readonly passwordMinLength: number | null;
  readonly activeUsers: number;
  readonly tickets: number;
  readonly anonymizedUsers: number;
  readonly openRequests: number;
};

const texts = {
  bs: {
    title: 'Evidencija aktivnosti obrade — sistem za podršku (help desk)',
    notSet: '— nije uneseno —',
    disabled: 'nije ograničeno (brisanje isključeno)',
    days: (n: number) => `${n} dana`,
    controller: 'Kontrolor',
    controllerName: 'Naziv',
    controllerAddress: 'Adresa',
    dpoName: 'Službenik za zaštitu podataka',
    dpoEmail: 'Kontakt službenika',
    purpose: 'Svrha i pravni osnov',
    purposeLabel: 'Svrha obrade',
    legalBasis: 'Pravni osnov',
    subjects: 'Kategorije nosilaca podataka',
    subjectsValue:
      'Zaposleni koji prijavljuju zahtjeve (podnosioci)\nAgenti podrške i administratori sistema',
    categories: 'Kategorije ličnih podataka',
    categoryRows: [
      ['Identifikacija', 'ime i prezime, službeni e-mail, organizaciona jedinica, uloge i grupe, atributi iz imenika (DN, kompanija, odjel, nadređeni)'],
      ['Sadržaj zahtjeva', 'naslov, opis, polja obrasca, poruke, interne bilješke, ocjene zadovoljstva'],
      ['Prilozi', 'fajlovi koje korisnici prilože uz zahtjeve'],
      ['Tehnički podaci', 'sesije prijave (vrijeme, IP adresa, preglednik), dnevnik revizije (audit)'],
      ['Rad agenata', 'evidencija utrošenog vremena, dodjele i prosljeđivanja'],
    ] as const,
    recipients: 'Primaoci i obrađivači',
    smtp: 'Server za slanje e-pošte',
    directory: 'Active Directory (LDAPS)',
    directoryValue: 'čitanje korisnika i organizacionih jedinica (sinhronizacija)',
    entra: 'Microsoft Entra ID',
    entraValue: 'prijava korisnika (SSO). Moguć prenos izvan BiH — provjeriti ugovor s Microsoftom.',
    clamav: 'Antivirusna provjera priloga',
    clamavValue: 'ClamAV, lokalno na istom serveru (bez prenosa trećim licima)',
    o365Note: 'Microsoft 365 / Gmail: moguć prenos izvan BiH — provjeriti ugovor.',
    none: 'isključeno',
    retention: 'Rokovi čuvanja',
    retentionLabels: {
      attachments: 'Prilozi zatvorenih tiketa',
      ticketContent: 'Sadržaj zatvorenih tiketa (opis, poruke)',
      audit: 'Dnevnik revizije',
      sessions: 'Sesije prijave (IP, preglednik)',
      emailDeliveries: 'Evidencija poslanih e-poruka',
      requestRegister: 'Registar zahtjeva nosilaca podataka',
    } satisfies Record<RetentionCategory, string>,
    retentionNote:
      'Kostur tiketa (broj, datumi, status, usluga, organizaciona jedinica) ostaje radi statistike. Bivši zaposleni se anonimizuju ručno, nakon deaktivacije.',
    exportLink: 'Paket izvoza podataka (šifrovan)',
    measures: 'Tehničke i organizacione mjere',
    measureRows: (facts: SystemFacts) =>
      [
        ['Kontrola pristupa', 'uloge i permisije (RBAC), vidljivost po organizacionim jedinicama, povjerljivi tiketi'],
        ['Autentifikacija', `${facts.entraEnabled ? 'Microsoft Entra ID (SSO); ' : ''}lokalne lozinke${facts.passwordMinLength ? ` (min. ${facts.passwordMinLength} znakova, historija, blok-lista)` : ''}; ograničenje pokušaja prijave; sesija 1 h`],
        ['Dvofaktorska prijava', facts.mfaRequiredForAdmins ? 'obavezna za administratore (TOTP)' : 'dostupna (TOTP)'],
        ['Šifrovanje', 'TOTP tajne i paketi izvoza AES-256-GCM; prenos preko HTTPS/TLS'],
        ['Revizija', 'dnevnik revizije s hash lancem (otkriva izmjene), kontrolne tačke pri brisanju'],
        ['Prilozi', 'antivirusna provjera, provjera tipa i veličine'],
        ['Kontinuitet', 'backup baze i plan oporavka (DR), ponovna primjena anonimizacija nakon povrata'],
      ] as const,
    stats: 'Stanje na dan izrade',
    statRows: (facts: SystemFacts) =>
      [
        ['Aktivni korisnici', String(facts.activeUsers)],
        ['Tiketi ukupno', String(facts.tickets)],
        ['Anonimizovani korisnici', String(facts.anonymizedUsers)],
        ['Otvoreni zahtjevi nosilaca', String(facts.openRequests)],
      ] as const,
  },
  en: {
    title: 'Record of processing activities — help desk system',
    notSet: '— not set —',
    disabled: 'unlimited (deletion disabled)',
    days: (n: number) => `${n} days`,
    controller: 'Controller',
    controllerName: 'Name',
    controllerAddress: 'Address',
    dpoName: 'Data protection officer',
    dpoEmail: 'DPO contact',
    purpose: 'Purpose and legal basis',
    purposeLabel: 'Purpose of processing',
    legalBasis: 'Legal basis',
    subjects: 'Categories of data subjects',
    subjectsValue: 'Employees who submit requests (requesters)\nSupport agents and system administrators',
    categories: 'Categories of personal data',
    categoryRows: [
      ['Identification', 'name, work e-mail, organizational unit, roles and groups, directory attributes (DN, company, department, manager)'],
      ['Request content', 'title, description, form fields, messages, internal notes, satisfaction ratings'],
      ['Attachments', 'files users attach to requests'],
      ['Technical data', 'sign-in sessions (time, IP address, browser), audit log'],
      ['Agent work', 'time tracking, assignments and forwards'],
    ] as const,
    recipients: 'Recipients and processors',
    smtp: 'Outgoing e-mail server',
    directory: 'Active Directory (LDAPS)',
    directoryValue: 'reading users and organizational units (synchronization)',
    entra: 'Microsoft Entra ID',
    entraValue: 'user sign-in (SSO). Transfer outside BiH is possible — check the Microsoft agreement.',
    clamav: 'Attachment virus scanning',
    clamavValue: 'ClamAV, locally on the same server (no transfer to third parties)',
    o365Note: 'Microsoft 365 / Gmail: transfer outside BiH is possible — check the agreement.',
    none: 'disabled',
    retention: 'Retention periods',
    retentionLabels: {
      attachments: 'Attachments of closed tickets',
      ticketContent: 'Content of closed tickets (description, messages)',
      audit: 'Audit log',
      sessions: 'Sign-in sessions (IP, browser)',
      emailDeliveries: 'Sent e-mail log',
      requestRegister: 'Register of data subject requests',
    } satisfies Record<RetentionCategory, string>,
    retentionNote:
      'The ticket skeleton (number, dates, status, service, organizational unit) is kept for statistics. Former employees are anonymized manually after deactivation.',
    exportLink: 'Data export package (encrypted)',
    measures: 'Technical and organizational measures',
    measureRows: (facts: SystemFacts) =>
      [
        ['Access control', 'roles and permissions (RBAC), visibility by organizational unit, confidential tickets'],
        ['Authentication', `${facts.entraEnabled ? 'Microsoft Entra ID (SSO); ' : ''}local passwords${facts.passwordMinLength ? ` (min. ${facts.passwordMinLength} characters, history, blocklist)` : ''}; sign-in rate limiting; 1 h session`],
        ['Two-factor sign-in', facts.mfaRequiredForAdmins ? 'required for administrators (TOTP)' : 'available (TOTP)'],
        ['Encryption', 'TOTP secrets and export packages AES-256-GCM; transport over HTTPS/TLS'],
        ['Audit', 'hash-chained audit log (detects tampering), checkpoints on purge'],
        ['Attachments', 'virus scanning, type and size checks'],
        ['Continuity', 'database backup and disaster recovery plan, anonymizations re-applied after restore'],
      ] as const,
    stats: 'Status on the day of generation',
    statRows: (facts: SystemFacts) =>
      [
        ['Active users', String(facts.activeUsers)],
        ['Tickets in total', String(facts.tickets)],
        ['Anonymized users', String(facts.anonymizedUsers)],
        ['Open data subject requests', String(facts.openRequests)],
      ] as const,
  },
} as const;

/** Pure: the record from configuration and system facts (tested without a database). */
export function buildProcessingRecord(
  configuration: PrivacyConfiguration,
  facts: SystemFacts,
  locale: RecordLocale,
  now: Date,
): ProcessingRecord {
  const t = texts[locale];
  const orNotSet = (value: string) => (value.trim().length === 0 ? t.notSet : value.trim());
  const c = configuration.controller;
  const missing = (['name', 'address', 'dpoName', 'dpoEmail', 'purpose', 'legalBasis'] as const).filter(
    (key) => c[key].trim().length === 0,
  );
  const smtpValue = facts.smtpEnabled ? facts.smtpHost ?? t.notSet : t.none;
  const cloudMail = facts.smtpEnabled && /office365|outlook|gmail|google/i.test(facts.smtpHost ?? '');
  return {
    locale,
    generatedAt: now.toISOString(),
    title: t.title,
    missing,
    sections: [
      {
        key: 'controller',
        title: t.controller,
        rows: [
          { label: t.controllerName, value: orNotSet(c.name) },
          { label: t.controllerAddress, value: orNotSet(c.address) },
          { label: t.dpoName, value: orNotSet(c.dpoName) },
          { label: t.dpoEmail, value: orNotSet(c.dpoEmail) },
        ],
      },
      {
        key: 'purpose',
        title: t.purpose,
        rows: [
          { label: t.purposeLabel, value: orNotSet(c.purpose) },
          { label: t.legalBasis, value: orNotSet(c.legalBasis) },
        ],
      },
      { key: 'subjects', title: t.subjects, rows: [{ label: t.subjects, value: t.subjectsValue }] },
      {
        key: 'categories',
        title: t.categories,
        rows: t.categoryRows.map(([label, value]) => ({ label, value })),
      },
      {
        key: 'recipients',
        title: t.recipients,
        rows: [
          { label: t.smtp, value: cloudMail ? `${smtpValue}\n${t.o365Note}` : smtpValue },
          { label: t.directory, value: facts.directoryEnabled ? t.directoryValue : t.none },
          { label: t.entra, value: facts.entraEnabled ? t.entraValue : t.none },
          { label: t.clamav, value: t.clamavValue },
        ],
      },
      {
        key: 'retention',
        title: t.retention,
        rows: [
          ...retentionCategories.map((category) => ({
            label: t.retentionLabels[category],
            value: configuration.retentionDays[category] > 0 ? t.days(configuration.retentionDays[category]) : t.disabled,
          })),
          { label: t.exportLink, value: t.days(configuration.exportLinkValidDays) },
          { label: '', value: t.retentionNote },
        ],
      },
      {
        key: 'measures',
        title: t.measures,
        rows: t.measureRows(facts).map(([label, value]) => ({ label, value })),
      },
      {
        key: 'stats',
        title: t.stats,
        rows: t.statRows(facts).map(([label, value]) => ({ label, value })),
      },
    ],
  };
}

/**
 * Paket 2.6 (§8): record of processing activities, generated from the
 * controller settings and what the installation actually does.
 */
@Injectable()
export class ProcessingRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly configurationLoader: PrivacyConfigurationLoader,
  ) {}

  async build(locale: RecordLocale, now: Date = new Date()): Promise<ProcessingRecord> {
    const [configuration, facts] = await Promise.all([this.configurationLoader.load(), this.facts()]);
    return buildProcessingRecord(configuration, facts, locale, now);
  }

  async facts(): Promise<SystemFacts> {
    const read = (key: string) =>
      this.settingsService.getSetting(key as never).catch(() => undefined) as Promise<unknown>;
    const [smtpEnabled, smtpHost, adRead, mode, clientId, mfaAdmins, minLength] = await Promise.all([
      read(settingKeys.privateSmtpEnabled),
      read(settingKeys.privateSmtpHost),
      read(settingKeys.privateAuthAdReadEnabled),
      read(settingKeys.privateAuthMode),
      read(settingKeys.privateAuthAzureClientId),
      read(settingKeys.privateAuthMfaRequiredForAdmins),
      read(settingKeys.privateAuthPasswordMinLength),
    ]);
    const [activeUsers, tickets, anonymizedUsers, openRequests] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.ticket.count(),
      this.prisma.user.count({ where: { anonymizedAt: { not: null } } }),
      this.prisma.dataSubjectRequest.count({ where: { status: { notIn: [...closedRequestStatuses] } } }),
    ]);
    return {
      smtpEnabled: smtpEnabled === true,
      smtpHost: typeof smtpHost === 'string' && smtpHost.trim().length > 0 ? smtpHost.trim() : null,
      directoryEnabled: adRead === true,
      entraEnabled: mode === 'entra_ad' || (typeof clientId === 'string' && clientId.trim().length > 0),
      mfaRequiredForAdmins: mfaAdmins === true,
      passwordMinLength: typeof minLength === 'number' ? minLength : null,
      activeUsers,
      tickets,
      anonymizedUsers,
      openRequests,
    };
  }
}
