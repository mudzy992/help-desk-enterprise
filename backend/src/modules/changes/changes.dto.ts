import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { changeActions, changeLevels, changeLimits, changeOutcomes, changeTypes } from './changes.constants';

const idList = () => [IsOptional(), IsArray(), ArrayMaxSize(changeLimits.linksMax), IsString({ each: true }), MaxLength(64, { each: true })];

function applyAll(decorators: PropertyDecorator[]): PropertyDecorator {
  return (target, key) => decorators.forEach((decorator) => decorator(target, key));
}

export class CreateChangeDto {
  @IsIn(changeTypes) type!: (typeof changeTypes)[number];
  /** STANDARD: the template fills plans, impact, likelihood and services. */
  @IsOptional() @IsString() @MaxLength(64) templateId?: string | null;
  @IsString() @MinLength(changeLimits.titleMin) @MaxLength(changeLimits.titleMax) title!: string;
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) description?: string;
  @IsOptional() @IsString() @MaxLength(changeLimits.reasonTextMax) reason?: string;
  @IsOptional() @IsIn(changeLevels) impact?: (typeof changeLevels)[number];
  @IsOptional() @IsIn(changeLevels) likelihood?: (typeof changeLevels)[number];
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) implementationPlan?: string | null;
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) backoutPlan?: string | null;
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) testPlan?: string | null;
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) communicationPlan?: string | null;
  @IsOptional() @IsBoolean() causesDowntime?: boolean;
  @IsOptional() @IsISO8601() plannedStart?: string | null;
  @IsOptional() @IsISO8601() plannedEnd?: string | null;
  /** Empty = the viewer's home unit. */
  @IsOptional() @IsString() @MaxLength(64) organizationalUnitId?: string;
  @IsOptional() @IsString() @MaxLength(64) cabGroupId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) ownerUserId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) problemId?: string | null;
  @applyAll(idList()) serviceIds?: string[];
  @applyAll(idList()) assetIds?: string[];
}

export class UpdateChangeDto {
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsString() @MinLength(changeLimits.titleMin) @MaxLength(changeLimits.titleMax) title?: string;
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) description?: string;
  @IsOptional() @IsString() @MaxLength(changeLimits.reasonTextMax) reason?: string;
  @IsOptional() @IsIn(changeTypes) type?: (typeof changeTypes)[number];
  @IsOptional() @IsIn(changeLevels) impact?: (typeof changeLevels)[number];
  @IsOptional() @IsIn(changeLevels) likelihood?: (typeof changeLevels)[number];
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) implementationPlan?: string | null;
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) backoutPlan?: string | null;
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) testPlan?: string | null;
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) communicationPlan?: string | null;
  @IsOptional() @IsBoolean() causesDowntime?: boolean;
  @IsOptional() @IsISO8601() plannedStart?: string | null;
  @IsOptional() @IsISO8601() plannedEnd?: string | null;
  @IsOptional() @IsString() @MaxLength(64) organizationalUnitId?: string;
  @IsOptional() @IsString() @MaxLength(64) cabGroupId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) ownerUserId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) problemId?: string | null;
  /** Replaces the linked services / assets when present. */
  @applyAll(idList()) serviceIds?: string[];
  @applyAll(idList()) assetIds?: string[];
}

export class ChangeActionDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(changeActions) action!: (typeof changeActions)[number];
  @IsOptional() @IsString() @MaxLength(changeLimits.reasonMax) reason?: string;
  @IsOptional() @IsIn(changeOutcomes) outcome?: (typeof changeOutcomes)[number];
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) reviewNotes?: string;
  /** §9: required when the window has conflicts. */
  @IsOptional() @IsBoolean() acknowledgeConflicts?: boolean;
}

export class ChangeVoteDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(changeLimits.commentMax) comment?: string;
}

export class ChangeTemplateDto {
  @IsString() @MinLength(3) @MaxLength(changeLimits.templateNameMax) name!: string;
  @IsString() @MaxLength(changeLimits.templateDescriptionMax) description!: string;
  @IsString() @MinLength(1) @MaxLength(changeLimits.textMax) implementationPlan!: string;
  @IsString() @MinLength(1) @MaxLength(changeLimits.textMax) backoutPlan!: string;
  @IsOptional() @IsString() @MaxLength(changeLimits.textMax) testPlan?: string | null;
  @IsIn(changeLevels) impact!: (typeof changeLevels)[number];
  @IsIn(changeLevels) likelihood!: (typeof changeLevels)[number];
  @IsOptional() @IsBoolean() causesDowntime?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @applyAll(idList()) serviceIds?: string[];
}
