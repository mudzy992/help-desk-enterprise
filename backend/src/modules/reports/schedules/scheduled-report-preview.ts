import type { EmailLocale } from '../../notifications/email/email-template.constants';
import type { EmailTemplateRegistry } from '../../notifications/email/email-template.types';
import type { EmailChannelConfiguration } from '../../notifications/email/load-email-channel-configuration';
import type { RenderedEmailMessage } from '../../notifications/email/render-email-message';
import { addCivilMonths, type CivilDay } from '../trends/civil-calendar';
import type { ReportTrendPoint } from '../trends/report-trends.types';
import { composeScheduledReportEmail } from './compose-scheduled-report-email';

const sampleNames: Readonly<Record<EmailLocale, { unit: string; services: string[]; schedule: string; owner: string }>> = {
  bs: {
    unit: 'Služba IT',
    services: ['VPN pristup', 'E-mail i kalendar', 'Štampači', 'Poslovne aplikacije'],
    schedule: 'Mjesečni izvještaj IT podrške',
    owner: 'Amra Hodžić',
  },
  en: {
    unit: 'IT department',
    services: ['VPN access', 'E-mail and calendar', 'Printers', 'Business applications'],
    schedule: 'Monthly IT support report',
    owner: 'Amra Hodžić',
  },
};

/** Paket 2.5: e-mail template editor preview with fixed sample numbers. */
export function composeScheduledReportPreview(input: {
  readonly configuration: EmailChannelConfiguration;
  readonly templates: EmailTemplateRegistry;
  readonly locale: EmailLocale;
  readonly recipientName: string;
}): RenderedEmailMessage {
  const names = sampleNames[input.locale];
  const lastDay: CivilDay = { year: 2026, month: 9, day: 30 };
  const firstDay: CivilDay = { year: 2026, month: 9, day: 1 };
  const trendFirstDay = addCivilMonths(firstDay, -11);
  const points: ReportTrendPoint[] = Array.from({ length: 12 }, (_, index) => {
    const day = addCivilMonths(trendFirstDay, index);
    const created = 380 + ((index * 37) % 90);
    const resolved = 360 + ((index * 53) % 110);
    const key = `${day.year}-${String(day.month).padStart(2, '0')}-01`;
    return {
      key,
      start: `${key}T00:00:00.000Z`,
      end: `${key}T00:00:00.000Z`,
      partial: false,
      created,
      resolved,
      net: created - resolved,
      backlog: 140 + ((index * 11) % 40),
      firstResponse: { medianHours: 1.2 + (index % 3) * 0.3, p90Hours: 6, sampleCount: created },
      resolution: { medianHours: 14 + (index % 4) * 2.5, p90Hours: 70, sampleCount: resolved },
      slaResponse: { total: created, met: Math.round(created * 0.93), percent: 93 - (index % 3) },
      slaResolution: { total: resolved, met: Math.round(resolved * 0.88), percent: 86 + (index % 5) },
      csat: { count: index === 11 ? 3 : 20 + index, average: 4.2 + (index % 3) * 0.1, satisfiedPercent: 84, lowSample: index === 11 },
    };
  });
  const composed = composeScheduledReportEmail({
    configuration: input.configuration,
    templates: input.templates,
    locale: input.locale,
    recipientId: 'preview',
    recipientName: input.recipientName,
    scheduleName: names.schedule,
    ownerName: names.owner,
    content: {
      frequency: 'MONTHLY',
      sections: ['kpi', 'trend', 'topServices', 'overdue'],
      period: {
        start: new Date(Date.UTC(2026, 8, 1)),
        end: new Date(Date.UTC(2026, 9, 1)),
        firstDay,
        lastDay,
      },
      scope: {
        organizationalUnitId: 'preview-unit',
        unitName: names.unit,
        serviceId: null,
        serviceName: null,
        groupId: null,
        groupName: null,
        priority: null,
      },
      trendPoints: points,
      topServices: {
        items: names.services.map((name, index) => ({
          serviceId: `preview-${index}`,
          name,
          current: 120 - index * 25,
          previous: 110 - index * 20,
          changePercent: null,
        })),
        other: { current: 40, previous: 52 },
        totalCurrent: 410,
        totalPrevious: 412,
      },
      overdue: {
        rows: [
          { name: names.services[0] as string, count: 7 },
          { name: names.services[3] as string, count: 3 },
        ],
        total: 10,
      },
      settings: { slaTargetPercent: 90, csatMinSample: 5 },
      trendFirstDay,
    },
    attachmentNames: ['monthly-kpi.csv'],
    omitted: [],
    attachmentMaxRows: 10_000,
    dedupeKey: 'preview:report.scheduled',
  });
  return { subject: composed.subject, html: composed.html, text: composed.text };
}
