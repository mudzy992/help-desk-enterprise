import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createBusinessHoursCalendar } from './create-business-hours-calendar';
import { deleteBusinessHoursCalendar } from './delete-business-hours-calendar';
import { executeSlaOperation } from './execute-sla-operation';
import { listBusinessHoursCalendars } from './list-business-hours-calendars';
import { listSlaChangeLogs } from './list-sla-change-logs';
import { requireBusinessHoursCalendar } from './load-business-hours-calendar';
import { slaChangeLogEntityTypes } from './sla.constants';
import { toCalendarResponse } from './to-calendar-response';
import { updateBusinessHoursCalendar } from './update-business-hours-calendar';
import type {
  BusinessHoursCalendarResponse,
  CalendarWriteInput,
  SlaChangeLogResponse,
  SlaMutationContext,
  SlaPage,
  UpdateCalendarInput,
} from './sla.types';
import type { SlaReadScope } from './sla-read-scope';
import { requireSlaCalendarReadScope } from './require-sla-read-scope';

@Injectable()
export class SlaCalendarsService {
  constructor(private readonly prisma: PrismaService) {}

  list(input?: { readonly scope?: SlaReadScope; readonly cursor?: string; readonly take?: number }): Promise<SlaPage<BusinessHoursCalendarResponse>> {
    return executeSlaOperation(async () => {
      const page = await listBusinessHoursCalendars(this.prisma, input);
      return { ...page, items: page.items.map(toCalendarResponse) };
    });
  }

  get(calendarId: string, scope?: SlaReadScope): Promise<BusinessHoursCalendarResponse> {
    return executeSlaOperation(async () => {
      if (scope !== undefined) await requireSlaCalendarReadScope(this.prisma, calendarId, scope);
      return toCalendarResponse(await requireBusinessHoursCalendar(this.prisma, calendarId));
    });
  }

  create(
    input: CalendarWriteInput,
    context: SlaMutationContext,
  ): Promise<BusinessHoursCalendarResponse> {
    return executeSlaOperation(async () =>
      toCalendarResponse(
        await createBusinessHoursCalendar(this.prisma, input, context),
      ),
    );
  }

  update(
    calendarId: string,
    input: UpdateCalendarInput,
    context: SlaMutationContext,
  ): Promise<BusinessHoursCalendarResponse> {
    return executeSlaOperation(async () =>
      toCalendarResponse(
        await updateBusinessHoursCalendar(this.prisma, calendarId, input, context),
      ),
    );
  }

  delete(
    calendarId: string,
    reason: string,
    context: SlaMutationContext,
  ): Promise<void> {
    return executeSlaOperation(() =>
      deleteBusinessHoursCalendar(this.prisma, calendarId, reason, context),
    );
  }

  listChanges(calendarId: string, input: { readonly scope: SlaReadScope; readonly cursor?: string; readonly take?: number }): Promise<SlaPage<SlaChangeLogResponse>> {
    return executeSlaOperation(async () => {
      await requireSlaCalendarReadScope(this.prisma, calendarId, input.scope);
      return listSlaChangeLogs(this.prisma, {
        entityType: slaChangeLogEntityTypes.calendar,
        entityId: calendarId,
        cursor: input.cursor,
        take: input.take,
      });
    });
  }
}
