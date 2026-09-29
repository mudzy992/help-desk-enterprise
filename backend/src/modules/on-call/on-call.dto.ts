import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class SaveOnCallScheduleDto {
  @IsString() @Length(1, 64) timezone!: string;
  @Matches(/^([01]\d|2[0-3]):(00|15|30|45)$/) handoffTime!: string;
  @IsIn(['DAY', 'WEEK']) rotationLength!: 'DAY' | 'WEEK';
  @Matches(/^\d{4}-\d{2}-\d{2}$/) rotationStartDate!: string;
  @IsBoolean() isActive!: boolean;
  @IsBoolean() autoAssignOutsideHours!: boolean;
  @IsOptional() @IsString() @MaxLength(64) ownerUserId?: string | null;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) memberUserIds!: string[];
  @IsString() @Length(3, 500) reason!: string;
}

export class OnCallReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class CreateOnCallOverrideDto {
  @IsString() @MaxLength(64) userId!: string;
  @IsISO8601() @MaxLength(40) startsAt!: string;
  @IsISO8601() @MaxLength(40) endsAt!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class RequestOnCallSwapDto {
  @IsString() @MaxLength(64) colleagueId!: string;
  @IsISO8601() @MaxLength(40) startsAt!: string;
  @IsISO8601() @MaxLength(40) endsAt!: string;
  @IsString() @Length(3, 500) reason!: string;
}

export class OnCallRangeQueryDto {
  @IsOptional() @IsISO8601() @MaxLength(40) from?: string;
  @IsOptional() @IsISO8601() @MaxLength(40) to?: string;
}
