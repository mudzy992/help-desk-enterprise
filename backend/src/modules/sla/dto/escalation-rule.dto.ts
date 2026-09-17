import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';

export class CreateSlaEscalationRuleDto {
  @IsString()
  @MinLength(1)
  slaProfileId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  triggerOffsetMinutes!: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  targetGroupId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  targetRole?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  targetUserId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class UpdateSlaEscalationRuleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  triggerOffsetMinutes?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  targetGroupId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  targetRole?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  targetUserId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class ListSlaEscalationRulesQueryDto {
  @IsString()
  @MinLength(1)
  slaProfileId!: string;
}
