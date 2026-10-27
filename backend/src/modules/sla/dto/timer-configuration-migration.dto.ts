import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class PreviewSlaTimerConfigurationMigrationDto {
  @IsString()
  @Length(1, 128)
  slaProfileId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  take = 100;
}

export class ApplySlaTimerConfigurationMigrationDto extends PreviewSlaTimerConfigurationMigrationDto {
  @IsString()
  @Length(64, 64)
  previewToken!: string;

  @IsString()
  @Length(3, 500)
  reason!: string;
}
