import { IsIn, IsString, MinLength } from 'class-validator';
import { allowedAuditExportFormats } from '../audit-log.constants';

export class ExportAuditLogQueryDto {
  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsString()
  @IsIn([...allowedAuditExportFormats])
  format!: (typeof allowedAuditExportFormats)[number];
}
