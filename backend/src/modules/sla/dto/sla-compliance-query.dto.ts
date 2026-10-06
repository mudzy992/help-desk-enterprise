import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { defaultSlaComplianceWindowDays } from '../aggregate-sla-compliance';

export class SlaComplianceQueryDto {
  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = defaultSlaComplianceWindowDays;
}
