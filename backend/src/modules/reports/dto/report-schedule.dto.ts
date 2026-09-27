import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { reportPackKeyList } from '../reports.constants';
import { reportScheduleSendTimePattern } from '../schedules/report-schedule-calendar';
import {
  reportScheduleFrequencies,
  reportScheduleNameMaxLength,
  reportScheduleSections,
  type ReportScheduleFrequency,
  type ReportScheduleSection,
} from '../schedules/report-schedule.constants';
import { reportTrendPriorities, type ReportTrendPriority } from '../trends/report-trends.constants';

/** Paket 2.5 (§5.5). Limits that are settings (recipients) are checked in the service. */
export class SaveReportScheduleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(reportScheduleNameMaxLength)
  name!: string;

  @IsIn([...reportScheduleFrequencies])
  frequency!: ReportScheduleFrequency;

  @IsString()
  @Matches(reportScheduleSendTimePattern)
  sendTime!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  organizationalUnitId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  groupId?: string;

  @IsOptional()
  @IsIn([...reportTrendPriorities])
  priority?: ReportTrendPriority;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn([...reportScheduleSections], { each: true })
  sections!: ReportScheduleSection[];

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(reportPackKeyList.length)
  @IsIn([...reportPackKeyList], { each: true })
  packKeys!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  recipientUserIds!: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class RecipientCandidatesQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  organizationalUnitId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class SetReportScheduleEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
