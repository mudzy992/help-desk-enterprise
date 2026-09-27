import type { ReportExportRow } from '../reports.types';
import type { ReportTrends } from './report-trends.types';

export const reportTrendExportColumns = [
  'period',
  'periodStart',
  'periodEnd',
  'partial',
  'created',
  'resolved',
  'net',
  'backlog',
  'firstResponseMedianHours',
  'firstResponseP90Hours',
  'firstResponseSamples',
  'resolutionMedianHours',
  'resolutionP90Hours',
  'resolutionSamples',
  'slaResponseTotal',
  'slaResponseMet',
  'slaResponsePercent',
  'slaResolutionTotal',
  'slaResolutionMet',
  'slaResolutionPercent',
  'csatCount',
  'csatAverage',
  'csatSatisfiedPercent',
] as const;

/** One row per bucket; the same numbers the charts show (design §3). */
export function toReportTrendExportRows(trends: ReportTrends): ReportExportRow[] {
  return trends.points.map((point) => ({
    period: point.key,
    periodStart: point.start,
    periodEnd: point.end,
    partial: point.partial ? 'yes' : 'no',
    created: point.created,
    resolved: point.resolved,
    net: point.net,
    backlog: point.backlog,
    firstResponseMedianHours: point.firstResponse.medianHours,
    firstResponseP90Hours: point.firstResponse.p90Hours,
    firstResponseSamples: point.firstResponse.sampleCount,
    resolutionMedianHours: point.resolution.medianHours,
    resolutionP90Hours: point.resolution.p90Hours,
    resolutionSamples: point.resolution.sampleCount,
    slaResponseTotal: point.slaResponse.total,
    slaResponseMet: point.slaResponse.met,
    slaResponsePercent: point.slaResponse.percent,
    slaResolutionTotal: point.slaResolution.total,
    slaResolutionMet: point.slaResolution.met,
    slaResolutionPercent: point.slaResolution.percent,
    csatCount: point.csat.count,
    csatAverage: point.csat.average,
    csatSatisfiedPercent: point.csat.satisfiedPercent,
  }));
}
