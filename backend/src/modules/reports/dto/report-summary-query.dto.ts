import { IsIn, IsOptional } from 'class-validator';
import {
  dashboardSummaryScopes,
  type DashboardSummaryScope,
} from '../summary/report-summary.types';

export class ReportSummaryQueryDto {
  /**
   * Phase 2.4 (plan §2.4): `GET /reports/dashboard/summary?scope=`.
   * The three narrow scopes mirror the ticket workspace views.
   */
  @IsOptional()
  @IsIn([...dashboardSummaryScopes])
  scope?: DashboardSummaryScope;
}
