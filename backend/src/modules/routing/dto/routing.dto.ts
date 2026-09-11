import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
}
