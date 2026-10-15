import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import {
  TicketImpact,
  TicketPriority,
  TicketUrgency,
} from '../../../generated/prisma/enums';
import type { WeeklyHours } from '../../sla/sla.types';
import type { InstallSlaReviewOutcome } from '../install-sla-review.types';

/**
 * F4.4: `confirmed` accepts the seeded default; `adjusted` carries the working
 * hours and/or the matrix cells that changed. The `reason` is not accepted from
 * the client — the wizard always writes `install_wizard`.
 */
export class InstallSlaReviewCalendarDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string;

  /**
   * Shape is validated by the SLA domain (`updateBusinessHoursCalendar`), which is
   * where the SLA screens validate it too — a second copy here would drift.
   */
  @IsOptional()
  @IsObject()
  weeklyHours?: WeeklyHours;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class InstallSlaReviewCellDto {
  @IsEnum(TicketImpact)
  impact!: TicketImpact;

  @IsEnum(TicketUrgency)
  urgency!: TicketUrgency;

  @IsEnum(TicketPriority)
  priority!: TicketPriority;
}

export class SaveInstallSlaReviewDto {
  @IsIn(['confirmed', 'adjusted'] satisfies readonly InstallSlaReviewOutcome[])
  outcome!: InstallSlaReviewOutcome;

  @IsOptional()
  @ValidateNested()
  @Type(() => InstallSlaReviewCalendarDto)
  calendar?: InstallSlaReviewCalendarDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => InstallSlaReviewCellDto)
  cells?: InstallSlaReviewCellDto[];
}
