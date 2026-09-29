import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';

export class CreateConfigVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  releaseNotes?: string;
}

export class ConfigVersionReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class RollbackConfigVersionDto extends ConfigVersionReasonDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  targetVersionId?: string;
}

export class DiffConfigVersionQueryDto {
  @IsString()
  @MinLength(1)
  againstId!: string;
}

/** Paket 2.9 (K4). Query strings arrive as text; only "true" enables. */
export class ExportConfigPackageQueryDto {
  @IsOptional()
  @IsString()
  includeEnvironmentBound?: string;
}

/** Multipart text fields that accompany the uploaded package file. */
export class ImportConfigPackageDto {
  /** JSON object: { "<kind>": { "<natural key>": "<local id>" } }. */
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  mappings?: string;

  @IsOptional()
  @IsString()
  applyEnvironmentBound?: string;

  @IsOptional()
  @IsString()
  confirmUnsigned?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  releaseNotes?: string;
}
