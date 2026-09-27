import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { allowedReportExportFormats } from '../reports.constants';
import {
  reportTrendGranularities,
  reportTrendPriorities,
  type ReportTrendGranularity,
  type ReportTrendPriority,
} from '../trends/report-trends.constants';

/** Paket 2.5 (§4.3): every filter is optional and combines with the OU scope. */
export class ReportTrendsQueryDto {
  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn([...reportTrendGranularities])
  granularity?: ReportTrendGranularity;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  groupId?: string;

  @IsOptional()
  @IsIn([...reportTrendPriorities])
  priority?: ReportTrendPriority;
}

export class ExportReportTrendsQueryDto extends ReportTrendsQueryDto {
  @IsString()
  @IsIn([...allowedReportExportFormats])
  format!: (typeof allowedReportExportFormats)[number];
}

export const reportPdfViews = ['overview', 'trends'] as const;

/** Design §6: audit beacon of a print/PDF export (no content). */
export class RecordReportPdfExportDto {
  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsIn([...reportPdfViews])
  view!: (typeof reportPdfViews)[number];

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
