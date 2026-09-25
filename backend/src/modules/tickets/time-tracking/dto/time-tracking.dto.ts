import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Package 1.3 request bodies; the domain re-validates everything. */
export class StartTimeLogDto {
  @IsOptional()
  @IsBoolean()
  switchFromActive?: boolean;
}

export class StopTimeLogDto {
  @IsOptional()
  @IsIn(['MANUAL', 'AUTO_IDLE'])
  reason?: 'MANUAL' | 'AUTO_IDLE';

  @IsOptional()
  @IsISO8601()
  endedAt?: string;
}

export class ManualTimeLogDto {
  @IsISO8601()
  startedAt!: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes!: number;

  @IsString()
  @MaxLength(500)
  note!: string;
}

export class CorrectTimeLogDto {
  @IsOptional()
  @IsISO8601()
  startedAt?: string;

  @IsOptional()
  @IsISO8601()
  endedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class DeleteTimeLogDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ListTimeLogsQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;
}
