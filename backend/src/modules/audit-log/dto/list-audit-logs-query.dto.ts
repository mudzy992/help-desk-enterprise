import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  auditLogListDefaultTake,
  auditLogListMaxTake,
} from '../audit-log.constants';

export class ListAuditLogsQueryDto {
  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(auditLogListMaxTake)
  take?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cursor?: string;
}
