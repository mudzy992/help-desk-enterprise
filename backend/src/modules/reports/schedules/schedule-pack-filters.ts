import type { ReportPackFilters } from '../reports.types';
import {
  reportPackScheduleFilterKeys,
  reportPackScheduleFilterSupport,
  type ReportPackKey,
  type ReportPackScheduleFilterKey,
} from '../reports.constants';

/**
 * W7.54 (BA-reports-02): the slice a schedule promises in its scope line and in
 * its HTML sections. The CSV attachments must carry exactly the same slice —
 * sending OU-wide rows to a recipient who was told „servis VPN, prioritet
 * visok” is a data leak, not a formatting detail.
 */
export function schedulePackFilters(schedule: {
  readonly serviceId: string | null;
  readonly groupId: string | null;
  readonly priority: ReportPackFilters['priority'] | null;
}): ReportPackFilters {
  return {
    ...(schedule.serviceId === null ? {} : { serviceId: schedule.serviceId }),
    ...(schedule.groupId === null ? {} : { groupId: schedule.groupId }),
    ...(schedule.priority === null ? {} : { priority: schedule.priority }),
  };
}

/** Filter dimensions actually set on a filtered slice. */
export function activeScheduleFilterKeys(
  filters: ReportPackFilters,
): readonly ReportPackScheduleFilterKey[] {
  return reportPackScheduleFilterKeys.filter(
    (key) => filters[key] !== undefined,
  );
}

/**
 * Filters the pack cannot apply to its own rows. A non-empty result means the
 * attachment would be broader than the reported scope, so the runner omits it
 * with `filter_unsupported` instead of shipping OU-wide data.
 */
export function unsupportedScheduleFilterKeys(
  pack: ReportPackKey,
  filters: ReportPackFilters,
): readonly ReportPackScheduleFilterKey[] {
  const supported = reportPackScheduleFilterSupport[pack];
  return activeScheduleFilterKeys(filters).filter(
    (key) => !supported.includes(key),
  );
}
