import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { problemLimits, problemSeverities, problemStatuses } from './problems.constants';

export class ProblemWhyDto {
  @IsString() @MaxLength(problemLimits.whyTextMax) question!: string;
  @IsString() @MaxLength(problemLimits.whyTextMax) answer!: string;
}

export class CreateProblemDto {
  @IsString() @MinLength(3) @MaxLength(problemLimits.titleMax) title!: string;
  @IsString() @MinLength(1) @MaxLength(problemLimits.textMax) description!: string;
  @IsOptional() @IsIn(problemSeverities) impact?: (typeof problemSeverities)[number];
  @IsOptional() @IsIn(problemSeverities) urgency?: (typeof problemSeverities)[number];
  /** Empty = the viewer's home unit. */
  @IsOptional() @IsString() @MaxLength(64) organizationalUnitId?: string;
  @IsOptional() @IsString() @MaxLength(64) ownerUserId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) groupId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) serviceId?: string | null;
}

export class UpdateProblemDto {
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(problemLimits.titleMax) title?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(problemLimits.textMax) description?: string;
  @IsOptional() @IsIn(problemSeverities) impact?: (typeof problemSeverities)[number];
  @IsOptional() @IsIn(problemSeverities) urgency?: (typeof problemSeverities)[number];
  @IsOptional() @IsString() @MaxLength(64) organizationalUnitId?: string;
  @IsOptional() @IsString() @MaxLength(64) ownerUserId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) groupId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) serviceId?: string | null;
  @IsOptional() @IsString() @MaxLength(32) rootCauseCategory?: string | null;
  @IsOptional() @IsString() @MaxLength(problemLimits.textMax) rootCause?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(problemLimits.whysMax) @ValidateNested({ each: true }) @Type(() => ProblemWhyDto)
  rcaWhys?: ProblemWhyDto[] | null;
  @IsOptional() @IsString() @MaxLength(problemLimits.textMax) workaround?: string | null;
  @IsOptional() @IsString() @MaxLength(problemLimits.textMax) resolution?: string | null;
}

export class ProblemStatusDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(problemStatuses) status!: (typeof problemStatuses)[number];
  @IsOptional() @IsString() @MaxLength(problemLimits.reasonMax) reason?: string;
}
