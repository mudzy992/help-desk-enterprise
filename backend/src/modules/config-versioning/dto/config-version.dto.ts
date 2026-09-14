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
