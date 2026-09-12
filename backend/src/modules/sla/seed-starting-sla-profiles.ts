import { PrismaService } from '../../common/prisma/prisma.service';
import { ensureStartingBusinessHoursCalendar } from './ensure-starting-business-hours-calendar';
import { ensureStartingSlaProfile } from './ensure-starting-sla-profile';
import { startingSlaProfileDefinitions } from './starting-sla.constants';
import type { StartingSlaProfileEnsureResult } from './ensure-starting-sla-profile';

export type StartingSlaSeedResult = {
  readonly calendarId: string;
  readonly calendarKey: string;
  readonly calendarCreated: boolean;
  readonly profiles: readonly StartingSlaProfileEnsureResult[];
};

export async function seedStartingSlaProfiles(
  prisma: PrismaService,
): Promise<StartingSlaSeedResult> {
  const calendar = await ensureStartingBusinessHoursCalendar(prisma);
  const profiles: StartingSlaProfileEnsureResult[] = [];
  for (const definition of startingSlaProfileDefinitions) {
    profiles.push(
      await ensureStartingSlaProfile(prisma, definition, calendar.calendar),
    );
  }
  return {
    calendarId: calendar.calendar.id,
    calendarKey: calendar.calendar.key,
    calendarCreated: calendar.created,
    profiles,
  };
}
