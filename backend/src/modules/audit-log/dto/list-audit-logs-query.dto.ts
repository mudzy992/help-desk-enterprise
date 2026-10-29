import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  auditCursorMaxLength,
  auditCursorPattern,
  auditLogListMaxTake,
  auditOpaqueIdMaxLength,
  auditOpaqueIdPattern,
} from '../audit-log.constants';

export class ListAuditLogsQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(auditOpaqueIdMaxLength)
  @Matches(auditOpaqueIdPattern)
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
  @MaxLength(auditCursorMaxLength)
  @Matches(auditCursorPattern)
  cursor?: string;
}
