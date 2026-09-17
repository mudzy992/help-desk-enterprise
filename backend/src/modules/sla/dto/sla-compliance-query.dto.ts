import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { defaultSlaComplianceWindowDays } from '../aggregate-sla-compliance';

export class SlaComplianceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = defaultSlaComplianceWindowDays;
}
