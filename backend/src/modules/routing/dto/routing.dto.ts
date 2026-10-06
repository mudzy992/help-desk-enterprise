import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  routingCoverageDefaultTake,
  routingCoverageMaximumTake,
} from '../routing.constants';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';

export class CreateRoutingRuleDto {
  @IsString()
  @MinLength(1)
  originUnitId!: string;

  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsString()
  @MinLength(1)
  groupId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class UpdateRoutingRuleDto {
  @IsString()
  @MinLength(1)
  originUnitId!: string;

  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsString()
  @MinLength(1)
  groupId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class DeleteRoutingRuleDto {
  @IsString()
  @MinLength(1)
  originUnitId!: string;

  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}

export class ListRoutingRulesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  originUnitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string;
}

export class ResolveRoutingQueryDto {
  @IsString()
  @MinLength(1)
  originUnitId!: string;

  @IsString()
  @MinLength(1)
  serviceId!: string;
}

export class ListRoutingCoverageQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  originUnitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeInactive = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(routingCoverageMaximumTake)
  take = routingCoverageDefaultTake;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  cursor?: string;
}
