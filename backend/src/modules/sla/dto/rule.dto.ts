import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TicketPriority } from '../../../generated/prisma/enums';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';

export class CreateSlaRuleDto {
  @IsString()
  @MinLength(1)
  slaProfileId!: string;

  @IsEnum(TicketPriority)
  priority!: TicketPriority;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  responseMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  resolutionMinutes!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  evaluationOrder?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  organizationalUnitId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class UpdateSlaRuleDto {
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  responseMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  resolutionMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  evaluationOrder?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  organizationalUnitId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class ListSlaRulesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  slaProfileId?: string;
}

export class ResolveSlaTargetsQueryDto {
  @IsString()
  @MinLength(1)
  slaProfileId!: string;

  @IsEnum(TicketPriority)
  priority!: TicketPriority;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  organizationalUnitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  startedAt?: string;
}
