import { IsBoolean, IsOptional } from 'class-validator';

/**
 * `POST /install/restart` (owner decision 6). An empty body is the normal case —
 * „open the wizard again, keep everything that was answered“. The flag is for
 * the operator who wants the package and the content steps to ask again too.
 */
export class RestartInstallWizardDto {
  @IsOptional()
  @IsBoolean()
  includeStepMarkers?: boolean;
}
