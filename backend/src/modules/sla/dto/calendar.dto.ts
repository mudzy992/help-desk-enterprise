import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';
import { slaConstants } from '../sla.constants';

export class CalendarHolidayDto {
  @IsString()
  @MinLength(1)
  date!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(slaConstants.maximumHolidayNameLength)
  name!: string;
}

export class CreateBusinessHoursCalendarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(slaConstants.maximumKeyLength)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(slaConstants.maximumNameLength)
  name!: string;

  @IsString()
  @MinLength(1)
  timezone!: string;

  @Allow()
  weeklyHours!: unknown;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarHolidayDto)
  holidays?: CalendarHolidayDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class UpdateBusinessHoursCalendarDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(slaConstants.maximumNameLength)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  timezone?: string;

  @IsOptional()
  @Allow()
  weeklyHours?: unknown;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CalendarHolidayDto)
  holidays?: CalendarHolidayDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}
