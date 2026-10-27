import type { PrismaService } from '../../common/prisma/prisma.service';
import { listBusinessHoursCalendars } from '../sla/list-business-hours-calendars';
import { listPriorityMatrix } from '../sla/list-priority-matrix';
import { startingSlaCalendarKey } from '../sla/starting-sla.constants';
import { toCalendarResponse } from '../sla/to-calendar-response';
import type {
  InstallSlaReviewOutcome,
  InstallSlaReviewStatus,
} from './install-sla-review.types';
import type { SettingsService } from '../settings/settings.service';
import { settingKeys } from '../settings/setting-keys';
import { readInstallMarker } from './read-install-marker';

/**
 * F4.4: the review shows the seeded default, not a copy of it — the wizard reads
 * the same calendar (`BH_STANDARD`) and the same priority matrix the SLA screens
 * show, so „Potvrđujem podrazumijevano“ really means „what I saw“.
 */
export async function readInstallSlaReviewStatus(
  prisma: PrismaService,
  settingsService: SettingsService,
): Promise<InstallSlaReviewStatus> {
  const calendar = await findStartingCalendar(prisma);
  return {
    review: toOutcome(
      await readInstallMarker(settingsService, settingKeys.privateInstallSlaReview),
    ),
    calendar: calendar === null ? null : toCalendarResponse(calendar),
    matrix: await listPriorityMatrix(prisma),
  };
}

/** The seeded calendar; a deployment without it falls back to the first one. */
export async function findStartingCalendar(prisma: PrismaService) {
  const calendars = await listBusinessHoursCalendars(prisma);
  return (
    calendars.items.find((entry) => entry.key === startingSlaCalendarKey) ??
    calendars.items[0] ??
    null
  );
}

function toOutcome(value: string | null): InstallSlaReviewOutcome | null {
  return value === 'confirmed' || value === 'adjusted' ? value : null;
}
