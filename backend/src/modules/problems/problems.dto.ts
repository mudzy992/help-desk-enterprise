import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
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
  /** §8.1 "Create problem" from selected tickets: linked right after creation. */
  @IsOptional() @IsArray() @ArrayMaxSize(problemLimits.linkBatchMax) @IsString({ each: true }) @MaxLength(64, { each: true })
  ticketIds?: string[];
}

export class LinkProblemTicketsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(problemLimits.linkBatchMax) @IsString({ each: true }) @MaxLength(64, { each: true })
  ticketIds!: string[];
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
  /** §8.4: with status RESOLVED, also resolve the open linked tickets (explicit, previewed). */
  @IsOptional() @IsBoolean() resolveTickets?: boolean;
  @IsOptional() @IsString() @MaxLength(problemLimits.messageMax) message?: string;
  @IsOptional() @IsString() @MaxLength(64) closeCode?: string;
}

export class CreateProblemArticleDto {
  @IsString() @MinLength(3) @MaxLength(problemLimits.titleMax) title!: string;
  @IsString() @MinLength(1) @MaxLength(problemLimits.articleBodyMax) body!: string;
  @IsString() @MinLength(1) @MaxLength(64) serviceId!: string;
  @IsString() @MinLength(1) @MaxLength(64) organizationalUnitId!: string;
}
