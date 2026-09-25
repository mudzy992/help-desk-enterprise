import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { templateLimits, templateLocales } from '../templates.constants';

const kinds = ['REPLY', 'INTERNAL', 'ANY'] as const;

export class ListResponseTemplatesQueryDto {
  @IsOptional() @IsString() @MaxLength(64) ticketId?: string;
  @IsOptional() @IsIn(['REPLY', 'INTERNAL']) kind?: 'REPLY' | 'INTERNAL';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['true', 'false']) all?: 'true' | 'false';
}

export class ManageResponseTemplatesQueryDto {
  @IsOptional() @IsIn(['shared', 'mine']) ownership?: 'shared' | 'mine';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(64) serviceId?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'all']) state?: 'active' | 'inactive' | 'all';
}

export class SaveResponseTemplateDto {
  @IsOptional() @IsIn(['shared', 'personal']) ownership?: 'shared' | 'personal';
  @IsString() @MaxLength(templateLimits.nameMax + 20) name!: string;
  @IsString() @MaxLength(templateLimits.bodyMax + 100) bodyBs!: string;
  @IsOptional() @IsString() @MaxLength(templateLimits.bodyMax + 100) bodyEn?: string | null;
  @IsIn(kinds) kind!: (typeof kinds)[number];
  @IsOptional() @IsArray() @ArrayMaxSize(templateLimits.tagsMax + 5) @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(templateLimits.scopeItemsMax) @IsString({ each: true }) serviceIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(templateLimits.scopeItemsMax) @IsString({ each: true }) categoryIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(templateLimits.scopeItemsMax) @IsString({ each: true }) groupIds?: string[];
  /** Required for shared templates (A3); ignored for personal ones. */
  @IsOptional() @IsString() @MaxLength(templateLimits.reasonMax + 20) reason?: string;
}

export class DeleteWithReasonDto {
  @IsOptional() @IsString() @MaxLength(templateLimits.reasonMax + 20) reason?: string;
}

export class PreviewResponseTemplateDto {
  @IsString() @MaxLength(templateLimits.bodyMax + 100) body!: string;
  @IsOptional() @IsIn(templateLocales) locale?: 'bs' | 'en';
  @IsOptional() @IsString() @MaxLength(64) ticketId?: string;
}

export class RenderResponseTemplateDto {
  @IsOptional() @IsIn(templateLocales) locale?: 'bs' | 'en';
}

export class PlaybookStepDto {
  @IsOptional() @IsString() @MaxLength(64) stepKey?: string;
  @IsString() @MaxLength(templateLimits.stepTitleMax + 20) title!: string;
  @IsOptional() @IsString() @MaxLength(templateLimits.stepInstructionsMax + 20) instructions?: string | null;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MaxLength(64) knowledgeArticleId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) responseTemplateId?: string | null;
}

export class SavePlaybookDto {
  @IsString() @MaxLength(templateLimits.nameMax + 20) name!: string;
  @IsOptional() @IsString() @MaxLength(templateLimits.playbookDescriptionMax + 20) description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(templateLimits.scopeItemsMax) @IsString({ each: true }) serviceIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(templateLimits.scopeItemsMax) @IsString({ each: true }) categoryIds?: string[];
  @IsArray()
  @ArrayMaxSize(templateLimits.stepsMax + 5)
  @ValidateNested({ each: true })
  @Type(() => PlaybookStepDto)
  steps!: PlaybookStepDto[];
  @IsOptional() @IsString() @MaxLength(templateLimits.reasonMax + 20) reason?: string;
}

export class ManagePlaybooksQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(64) serviceId?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'all']) state?: 'active' | 'inactive' | 'all';
}

export class AttachTicketPlaybookDto {
  @IsString() @MaxLength(64) playbookId!: string;
}

export class SetTicketPlaybookStepDto {
  @IsBoolean() checked!: boolean;
}

