import { IsIn, IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';
import { allowedReportExportFormats } from '../reports.constants';

export class ReportScopeQueryDto {
  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class ExportReportPackQueryDto extends ReportScopeQueryDto {
  @IsString()
  @IsIn([...allowedReportExportFormats])
  format!: (typeof allowedReportExportFormats)[number];
}
