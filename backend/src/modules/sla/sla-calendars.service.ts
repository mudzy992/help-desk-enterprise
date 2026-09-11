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
  UpdateCalendarInput,
} from './sla.types';

@Injectable()
export class SlaCalendarsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<readonly BusinessHoursCalendarResponse[]> {
    return executeSlaOperation(async () =>
      (await listBusinessHoursCalendars(this.prisma)).map(toCalendarResponse),
    );
  }

  get(calendarId: string): Promise<BusinessHoursCalendarResponse> {
    return executeSlaOperation(async () =>
      toCalendarResponse(await requireBusinessHoursCalendar(this.prisma, calendarId)),
    );
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

  listChanges(calendarId: string): Promise<readonly SlaChangeLogResponse[]> {
    return executeSlaOperation(() =>
      listSlaChangeLogs(this.prisma, {
        entityType: slaChangeLogEntityTypes.calendar,
        entityId: calendarId,
      }),
    );
  }
}
