import type { EmailLocale } from '../../notifications/email/email-template.constants';
import type { ReportAttachmentOmitReason } from './report-schedule.constants';

/** Paket 2.5: fixed copy of the scheduled report e-mail (not admin-editable). */
export type ReportEmailLabels = {
  readonly sections: {
    readonly kpi: string;
    readonly trend: string;
    readonly topServices: string;
    readonly overdue: string;
  };
  readonly columns: {
    readonly metric: string;
    readonly period: string;
    readonly previous: string;
    readonly change: string;
    readonly bucket: string;
    readonly created: string;
    readonly resolved: string;
    readonly backlog: string;
    readonly slaResolution: string;
    readonly csat: string;
    readonly service: string;
    readonly tickets: string;
    readonly overdue: string;
  };
  readonly metrics: {
    readonly created: string;
    readonly resolved: string;
    readonly backlog: string;
    readonly slaResponse: string;
    readonly slaResolution: string;
    readonly firstResponseMedian: string;
    readonly resolutionMedian: string;
    readonly csat: string;
  };
  readonly other: string;
  readonly noData: string;
  readonly emptyTable: string;
  readonly hours: string;
  readonly ratings: string;
  readonly lowSampleNote: string;
  readonly slaNote: string;
  readonly overdueNote: string;
  readonly attachmentsNote: string;
  readonly attachmentOmitted: Readonly<Record<ReportAttachmentOmitReason, string>>;
  readonly footerReason: string;
  readonly footerReasonNoOwner: string;
  readonly scopeAll: string;
  readonly scopeService: string;
  readonly scopeGroup: string;
  readonly scopePriority: string;
  readonly priorities: Readonly<Record<string, string>>;
  readonly weekPeriod: string;
  readonly packs: Readonly<Record<string, string>>;
};

export const reportEmailLabels: Readonly<Record<EmailLocale, ReportEmailLabels>> = {
  bs: {
    sections: {
      kpi: 'Sažetak',
      trend: 'Trend',
      topServices: 'Najčešći servisi',
      overdue: 'Tiketi preko roka po servisu',
    },
    columns: {
      metric: 'Pokazatelj',
      period: 'Period',
      previous: 'Prethodni',
      change: 'Promjena',
      bucket: 'Period',
      created: 'Dolazni',
      resolved: 'Riješeni',
      backlog: 'Backlog',
      slaResolution: 'SLA rješ.',
      csat: 'CSAT',
      service: 'Servis',
      tickets: 'Tiketi',
      overdue: 'Preko roka',
    },
    metrics: {
      created: 'Dolazni tiketi',
      resolved: 'Riješeni tiketi',
      backlog: 'Backlog na kraju perioda',
      slaResponse: 'SLA odziv',
      slaResolution: 'SLA rješavanje',
      firstResponseMedian: 'Prvi odziv (medijana)',
      resolutionMedian: 'Vrijeme rješavanja (medijana)',
      csat: 'CSAT prosjek',
    },
    other: 'Ostalo',
    noData: '—',
    emptyTable: 'Nema podataka za ovaj period.',
    hours: '{value} h',
    ratings: '{value} ({count} ocjena)',
    lowSampleNote: 'Sivo: premalo CSAT ocjena za pouzdan prosjek (manje od {min}).',
    slaNote: 'Crveno: SLA ispod cilja od {target} %.',
    overdueNote: 'Stanje u trenutku slanja: otvoreni tiketi s prekoračenim SLA odzivom ili rješavanjem.',
    attachmentsNote: 'Prilozi (CSV) pokrivaju cijelu organizacionu jedinicu rasporeda za isti period.',
    attachmentOmitted: {
      too_many_rows: 'Prilog „{pack}” je izostavljen: ima više od {max} redova. Izvezite ga u aplikaciji.',
      too_large: 'Prilog „{pack}” je izostavljen: prilozi bi premašili 10 MB. Izvezite ga u aplikaciji.',
      pack_disabled: 'Prilog „{pack}” je izostavljen: paket izvještaja je isključen.',
      failed: 'Prilog „{pack}” nije mogao biti pripremljen.',
    },
    footerReason: 'Izvještaj šalje raspored „{name}” koji je postavio/la {owner}.',
    footerReasonNoOwner: 'Izvještaj šalje raspored „{name}”.',
    scopeAll: 'sve',
    scopeService: 'servis {name}',
    scopeGroup: 'grupa {name}',
    scopePriority: 'prioritet {name}',
    priorities: { LOW: 'nizak', MEDIUM: 'srednji', HIGH: 'visok', CRITICAL: 'kritičan' },
    weekPeriod: '{from} – {to}',
    packs: {
      monthly_kpi: 'Mjesečni KPI',
      overdue_by_service: 'Preko roka po servisu',
      top_close_codes: 'Najčešći kodovi zatvaranja',
      kb_helpfulness: 'Korisnost baze znanja',
      forward_ping_pong: 'Ping-pong prosljeđivanja',
      time_tracking: 'Evidencija vremena',
    },
  },
  en: {
    sections: {
      kpi: 'Summary',
      trend: 'Trend',
      topServices: 'Top services',
      overdue: 'Overdue tickets by service',
    },
    columns: {
      metric: 'Metric',
      period: 'Period',
      previous: 'Previous',
      change: 'Change',
      bucket: 'Period',
      created: 'Incoming',
      resolved: 'Resolved',
      backlog: 'Backlog',
      slaResolution: 'SLA res.',
      csat: 'CSAT',
      service: 'Service',
      tickets: 'Tickets',
      overdue: 'Overdue',
    },
    metrics: {
      created: 'Incoming tickets',
      resolved: 'Resolved tickets',
      backlog: 'Backlog at period end',
      slaResponse: 'SLA response',
      slaResolution: 'SLA resolution',
      firstResponseMedian: 'First response (median)',
      resolutionMedian: 'Resolution time (median)',
      csat: 'CSAT average',
    },
    other: 'Other',
    noData: '—',
    emptyTable: 'No data for this period.',
    hours: '{value} h',
    ratings: '{value} ({count} ratings)',
    lowSampleNote: 'Grey: too few CSAT ratings for a reliable average (fewer than {min}).',
    slaNote: 'Red: SLA below the {target} % target.',
    overdueNote: 'State at send time: open tickets past their SLA response or resolution deadline.',
    attachmentsNote: "CSV attachments cover the schedule's whole organizational unit for the same period.",
    attachmentOmitted: {
      too_many_rows: 'Attachment "{pack}" was left out: it has more than {max} rows. Export it in the application.',
      too_large: 'Attachment "{pack}" was left out: attachments would exceed 10 MB. Export it in the application.',
      pack_disabled: 'Attachment "{pack}" was left out: the report pack is disabled.',
      failed: 'Attachment "{pack}" could not be prepared.',
    },
    footerReason: 'This report is sent by the schedule "{name}" set up by {owner}.',
    footerReasonNoOwner: 'This report is sent by the schedule "{name}".',
    scopeAll: 'all',
    scopeService: 'service {name}',
    scopeGroup: 'group {name}',
    scopePriority: 'priority {name}',
    priorities: { LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical' },
    weekPeriod: '{from} – {to}',
    packs: {
      monthly_kpi: 'Monthly KPI',
      overdue_by_service: 'Overdue by service',
      top_close_codes: 'Top close codes',
      kb_helpfulness: 'Knowledge base helpfulness',
      forward_ping_pong: 'Forward ping-pong',
      time_tracking: 'Time tracking',
    },
  },
};

export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}
