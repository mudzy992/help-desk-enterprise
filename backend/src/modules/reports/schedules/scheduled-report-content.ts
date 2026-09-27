import type { CivilDay } from '../trends/civil-calendar';
import type { ReportTrendPoint, ReportTrends } from '../trends/report-trends.types';
import type { ReportScheduleFrequency, ReportScheduleSection } from './report-schedule.constants';

/** Paket 2.5: everything one scheduled e-mail shows (never persisted). */
export type ScheduledReportContent = {
  readonly frequency: ReportScheduleFrequency;
  readonly sections: readonly ReportScheduleSection[];
  readonly period: {
    readonly start: Date;
    readonly end: Date;
    readonly firstDay: CivilDay;
    readonly lastDay: CivilDay;
  };
  readonly scope: {
    readonly organizationalUnitId: string;
    readonly unitName: string;
    readonly serviceId: string | null;
    readonly serviceName: string | null;
    readonly groupId: string | null;
    readonly groupName: string | null;
    readonly priority: string | null;
  };
  /** Oldest first; the last point is the reported period, the one before it the comparison. */
  readonly trendPoints: readonly ReportTrendPoint[];
  readonly topServices: ReportTrends['topServices'] | null;
  readonly overdue: {
    readonly rows: readonly { readonly name: string; readonly count: number }[];
    readonly total: number;
  } | null;
  readonly settings: { readonly slaTargetPercent: number; readonly csatMinSample: number };
  /** First day of the trend section (link to the Trends tab). */
  readonly trendFirstDay: CivilDay;
};
