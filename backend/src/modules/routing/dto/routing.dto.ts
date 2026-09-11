import { IsOptional, IsString, MinLength } from 'class-validator';

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
