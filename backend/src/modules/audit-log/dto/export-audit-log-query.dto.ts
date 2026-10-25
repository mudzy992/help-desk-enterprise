import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  allowedAuditExportFormats,
  auditOpaqueIdMaxLength,
  auditOpaqueIdPattern,
} from '../audit-log.constants';

export class ExportAuditLogQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(auditOpaqueIdMaxLength)
  @Matches(auditOpaqueIdPattern)
  organizationalUnitId!: string;

  @IsString()
  @IsIn([...allowedAuditExportFormats])
  format!: (typeof allowedAuditExportFormats)[number];
}
