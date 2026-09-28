import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** §5.4: 15 min to 8 h, always with a reason (audit). */
export class SilenceOpsAlertsDto {
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  minutes!: number;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason!: string;
}

export class OpsAlertHistoryQueryDto {
  @IsOptional()
  @IsIn(['open', 'resolved', 'all'])
  status?: 'open' | 'resolved' | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
