import { createHash } from 'node:crypto';
import type { EmailLocale } from '../../notifications/email/email-template.constants';
import type { EmailTemplateRegistry } from '../../notifications/email/email-template.types';
import type { EmailChannelConfiguration } from '../../notifications/email/load-email-channel-configuration';
import {
  renderEmailMessage,
  type EmailReportRow,
  type EmailReportTable,
  type RenderedEmailMessage,
} from '../../notifications/email/render-email-message';
import { civilDayKey, type CivilDay } from '../trends/civil-calendar';
import type { ReportTrendPoint } from '../trends/report-trends.types';
import { fill, reportEmailLabels, type ReportEmailLabels } from './report-email-labels';
import { reportScheduleTopRows, type ReportAttachmentOmitReason } from './report-schedule.constants';
import type { ScheduledReportContent } from './scheduled-report-content';

export type ComposedScheduledReportEmail = RenderedEmailMessage & {
  readonly messageId: string;
  readonly headers: Readonly<Record<string, string>>;
};

const intlLocales: Readonly<Record<EmailLocale, string>> = { bs: 'bs-BA', en: 'en-GB' };

/** Paket 2.5 (§5.1): the scheduled report e-mail — tables and bars, no SVG or JS. */
export function composeScheduledReportEmail(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates?: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly recipientId: string;
  readonly recipientName: string;
  readonly scheduleName: string;
  readonly ownerName: string | null;
  readonly content: ScheduledReportContent;
  readonly attachmentNames: readonly string[];
  readonly omitted: readonly { readonly pack: string; readonly reason: ReportAttachmentOmitReason }[];
  readonly attachmentMaxRows: number;
  readonly dedupeKey: string;
  readonly test?: boolean;
}): ComposedScheduledReportEmail {
  const labels = reportEmailLabels[input.locale];
  const format = createFormatters(input.locale);
  const content = input.content;
  const presentation = input.configuration.presentation;
  const period = formatPeriod(content, input.locale, labels);
  const scope = formatScope(content, labels);
  const tables: EmailReportTable[] = [];
  const current = content.trendPoints[content.trendPoints.length - 1] ?? null;
  const previous = content.trendPoints[content.trendPoints.length - 2] ?? null;
  for (const section of content.sections) {
    if (section === 'kpi') {
      tables.push(kpiTable(current, previous, content, labels, format));
    } else if (section === 'trend') {
      tables.push(trendTable(content, labels, format));
    } else if (section === 'topServices' && content.topServices !== null) {
      tables.push(topServicesTable(content.topServices, labels, format));
    } else if (section === 'overdue' && content.overdue !== null) {
      tables.push(overdueTable(content.overdue, labels, format));
    }
  }
  const notes = [
    ...(input.attachmentNames.length > 0 ? [labels.attachmentsNote] : []),
    ...input.omitted.map((item) =>
      fill(labels.attachmentOmitted[item.reason], {
        pack: labels.packs[item.pack] ?? item.pack,
        max: format.integer(input.attachmentMaxRows),
      }),
    ),
  ];
  const templates = input.templates ?? input.configuration.templates;
  const rendered = renderEmailMessage({
    template: templates[input.locale]['report.scheduled'],
    locale: input.locale,
    variables: {
      recipientName: input.recipientName,
      reportName: input.scheduleName,
      reportPeriod: period,
      reportScope: scope,
      appName: presentation.appName,
    },
    appName: presentation.appName,
    accentColor: presentation.accentColor,
    confidential: false,
    ticket: null,
    excerpt: null,
    ctaUrl: presentation.publicUrl === null ? null : `${presentation.publicUrl}/reports?${trendsLinkQuery(content)}`,
    replyMode: 'no_reply',
    manageUrl: null,
    report: {
      tables,
      notes,
      footerReason:
        input.ownerName === null
          ? fill(labels.footerReasonNoOwner, { name: input.scheduleName })
          : fill(labels.footerReason, { name: input.scheduleName, owner: input.ownerName }),
    },
  });
  const domain = mailDomain(input.configuration.smtp?.fromAddress);
  return {
    subject: input.test === true ? `[TEST] ${rendered.subject}` : rendered.subject,
    html: rendered.html,
    text: rendered.text,
    messageId: `<${createHash('sha256').update(`${input.dedupeKey}:${input.recipientId}`).digest('hex').slice(0, 32)}@${domain}>`,
    headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
  };
}

/** Query string of the Trends tab with the schedule's filters (design §5.1 „Otvori u aplikaciji”). */
export function trendsLinkQuery(content: ScheduledReportContent): string {
  const params = new URLSearchParams({
    tab: 'trends',
    organizationalUnitId: content.scope.organizationalUnitId,
    from: civilDayKey(content.trendFirstDay),
    to: civilDayKey(content.period.lastDay),
    granularity: content.frequency === 'WEEKLY' ? 'week' : 'month',
  });
  if (content.scope.serviceId !== null) params.set('serviceId', content.scope.serviceId);
  if (content.scope.groupId !== null) params.set('groupId', content.scope.groupId);
  if (content.scope.priority !== null) params.set('priority', content.scope.priority);
  return params.toString();
}

type Formatters = ReturnType<typeof createFormatters>;

function createFormatters(locale: EmailLocale) {
  const integer = new Intl.NumberFormat(intlLocales[locale], { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(intlLocales[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return {
    integer: (value: number) => integer.format(value),
    decimal: (value: number) => decimal.format(value),
    percent: (value: number) => `${decimal.format(value)} %`,
    dayMonth: new Intl.DateTimeFormat(intlLocales[locale], { timeZone: 'UTC', day: '2-digit', month: '2-digit' }),
    fullDate: new Intl.DateTimeFormat(intlLocales[locale], {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    monthYear: new Intl.DateTimeFormat(intlLocales[locale], { timeZone: 'UTC', month: 'long', year: 'numeric' }),
    shortMonth: new Intl.DateTimeFormat(intlLocales[locale], { timeZone: 'UTC', month: 'short', year: '2-digit' }),
  };
}

function utcOf(day: CivilDay): Date {
  return new Date(Date.UTC(day.year, day.month - 1, day.day));
}

export function formatPeriod(content: ScheduledReportContent, locale: EmailLocale, labels: ReportEmailLabels): string {
  const format = createFormatters(locale);
  if (content.frequency === 'MONTHLY') {
    return format.monthYear.format(utcOf(content.period.firstDay));
  }
  return fill(labels.weekPeriod, {
    from: format.fullDate.format(utcOf(content.period.firstDay)),
    to: format.fullDate.format(utcOf(content.period.lastDay)),
  });
}

function formatScope(content: ScheduledReportContent, labels: ReportEmailLabels): string {
  const parts = [content.scope.unitName];
  if (content.scope.serviceName !== null) parts.push(fill(labels.scopeService, { name: content.scope.serviceName }));
  if (content.scope.groupName !== null) parts.push(fill(labels.scopeGroup, { name: content.scope.groupName }));
  if (content.scope.priority !== null) {
    parts.push(fill(labels.scopePriority, { name: labels.priorities[content.scope.priority] ?? content.scope.priority }));
  }
  return parts.join(', ');
}

function countChange(current: number, previous: number | null, format: Formatters, labels: ReportEmailLabels): string {
  if (previous === null || previous === 0) return labels.noData;
  return arrow(((current - previous) / previous) * 100, (value) => `${format.integer(Math.abs(value))} %`);
}

function pointChange(current: number | null, previous: number | null, format: Formatters, labels: ReportEmailLabels): string {
  if (current === null || previous === null) return labels.noData;
  return arrow(current - previous, (value) => `${format.decimal(Math.abs(value))} p.p.`);
}

function arrow(delta: number, render: (value: number) => string): string {
  if (Math.abs(delta) < 0.05) return `= ${render(0)}`;
  return `${delta > 0 ? '▲' : '▼'} ${render(delta)}`;
}

function kpiTable(
  current: ReportTrendPoint | null,
  previous: ReportTrendPoint | null,
  content: ScheduledReportContent,
  labels: ReportEmailLabels,
  format: Formatters,
): EmailReportTable {
  if (current === null) {
    return { title: labels.sections.kpi, columns: [], rows: [], empty: labels.emptyTable };
  }
  const target = content.settings.slaTargetPercent;
  const count = (label: string, pick: (point: ReportTrendPoint) => number): EmailReportRow => ({
    cells: [
      label,
      format.integer(pick(current)),
      previous === null ? labels.noData : format.integer(pick(previous)),
      countChange(pick(current), previous === null ? null : pick(previous), format, labels),
    ],
  });
  const ratio = (label: string, pick: (point: ReportTrendPoint) => number | null): EmailReportRow => {
    const value = pick(current);
    const before = previous === null ? null : pick(previous);
    return {
      cells: [
        label,
        value === null ? labels.noData : format.percent(value),
        before === null ? labels.noData : format.percent(before),
        pointChange(value, before, format, labels),
      ],
      alert: value !== null && value < target,
    };
  };
  const hours = (label: string, pick: (point: ReportTrendPoint) => number | null): EmailReportRow => {
    const value = pick(current);
    const before = previous === null ? null : pick(previous);
    const show = (hoursValue: number | null) =>
      hoursValue === null ? labels.noData : fill(labels.hours, { value: format.decimal(hoursValue) });
    return {
      cells: [
        label,
        show(value),
        show(before),
        value === null || before === null || before === 0
          ? labels.noData
          : arrow(((value - before) / before) * 100, (delta) => `${format.integer(Math.abs(delta))} %`),
      ],
    };
  };
  const csat = current.csat;
  const previousCsat = previous?.csat ?? null;
  const csatCell = (value: typeof csat | null) =>
    value === null || value.average === null
      ? labels.noData
      : fill(labels.ratings, { value: format.decimal(value.average), count: format.integer(value.count) });
  return {
    title: labels.sections.kpi,
    columns: [labels.columns.metric, labels.columns.period, labels.columns.previous, labels.columns.change],
    rows: [
      count(labels.metrics.created, (point) => point.created),
      count(labels.metrics.resolved, (point) => point.resolved),
      count(labels.metrics.backlog, (point) => point.backlog),
      ratio(labels.metrics.slaResponse, (point) => point.slaResponse.percent),
      ratio(labels.metrics.slaResolution, (point) => point.slaResolution.percent),
      hours(labels.metrics.firstResponseMedian, (point) => point.firstResponse.medianHours),
      hours(labels.metrics.resolutionMedian, (point) => point.resolution.medianHours),
      {
        cells: [
          labels.metrics.csat,
          csatCell(csat),
          csatCell(previousCsat),
          csat.average === null || previousCsat === null || previousCsat.average === null
            ? labels.noData
            : arrow(csat.average - previousCsat.average, (delta) => format.decimal(Math.abs(delta))),
        ],
        muted: csat.lowSample,
      },
    ],
    note: [
      fill(labels.slaNote, { target: String(target) }),
      ...(csat.lowSample ? [fill(labels.lowSampleNote, { min: String(content.settings.csatMinSample) })] : []),
    ].join(' '),
  };
}

function trendTable(
  content: ScheduledReportContent,
  labels: ReportEmailLabels,
  format: Formatters,
): EmailReportTable {
  const points = content.trendPoints;
  const peak = Math.max(1, ...points.map((point) => Math.max(point.created, point.resolved)));
  const bucketLabel = (point: ReportTrendPoint) => {
    const [year, month, day] = point.key.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    return content.frequency === 'MONTHLY' ? format.shortMonth.format(date) : format.dayMonth.format(date);
  };
  return {
    title: labels.sections.trend,
    columns: [
      labels.columns.bucket,
      labels.columns.created,
      labels.columns.resolved,
      labels.columns.backlog,
      labels.columns.slaResolution,
      labels.columns.csat,
    ],
    rows: points.map((point) => ({
      cells: [
        bucketLabel(point),
        format.integer(point.created),
        format.integer(point.resolved),
        format.integer(point.backlog),
        point.slaResolution.percent === null ? labels.noData : format.percent(point.slaResolution.percent),
        point.csat.average === null ? labels.noData : format.decimal(point.csat.average),
      ],
      bar: point.created / peak,
    })),
    empty: labels.emptyTable,
  };
}

function topServicesTable(
  top: NonNullable<ScheduledReportContent['topServices']>,
  labels: ReportEmailLabels,
  format: Formatters,
): EmailReportTable {
  const items = top.items.slice(0, reportScheduleTopRows);
  const peak = Math.max(1, ...items.map((item) => item.current), top.other.current);
  const rows: EmailReportRow[] = items.map((item) => ({
    cells: [item.name, format.integer(item.current), countChange(item.current, item.previous, format, labels)],
    bar: item.current / peak,
  }));
  if (top.other.current > 0 || top.other.previous > 0) {
    rows.push({
      cells: [labels.other, format.integer(top.other.current), countChange(top.other.current, top.other.previous, format, labels)],
      bar: top.other.current / peak,
      muted: true,
    });
  }
  return {
    title: labels.sections.topServices,
    columns: [labels.columns.service, labels.columns.tickets, labels.columns.change],
    rows,
    empty: labels.emptyTable,
  };
}

function overdueTable(
  overdue: NonNullable<ScheduledReportContent['overdue']>,
  labels: ReportEmailLabels,
  format: Formatters,
): EmailReportTable {
  const peak = Math.max(1, ...overdue.rows.map((row) => row.count));
  return {
    title: labels.sections.overdue,
    columns: [labels.columns.service, labels.columns.overdue],
    rows: overdue.rows.map((row) => ({
      cells: [row.name, format.integer(row.count)],
      bar: row.count / peak,
      alert: true,
    })),
    empty: labels.emptyTable,
    note: labels.overdueNote,
  };
}

function mailDomain(fromAddress: string | undefined): string {
  const domain = (fromAddress ?? '').split('@')[1]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9.-]+$/.test(domain) && domain.length > 0 ? domain : 'ephelpdesk.local';
}
