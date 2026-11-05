import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { templateLimits, templateLocales, templatesListMaximumTake } from '../templates.constants';

export class TemplatesCursorQueryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1024) cursor?: string;
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(templatesListMaximumTake)
  take?: number;
}

const kinds = ['REPLY', 'INTERNAL', 'ANY'] as const;

export class ListResponseTemplatesQueryDto extends TemplatesCursorQueryDto {
  @IsOptional() @IsString() @MaxLength(64) ticketId?: string;
  @IsOptional() @IsIn(['REPLY', 'INTERNAL']) kind?: 'REPLY' | 'INTERNAL';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['true', 'false']) all?: 'true' | 'false';
}

export class ManageResponseTemplatesQueryDto extends TemplatesCursorQueryDto {
  @IsOptional() @IsIn(['shared', 'mine']) ownership?: 'shared' | 'mine';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(64) serviceId?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'all']) state?: 'active' | 'inactive' | 'all';
}

export class SaveResponseTemplateDto {
  @IsOptional() @IsIn(['shared', 'personal']) ownership?: 'shared' | 'personal';
  /** Required for updates; the exact loaded revision prevents stale replacement. */
  @IsOptional() @IsDateString() @MaxLength(40) expectedUpdatedAt?: string;
  @IsString() @MaxLength(templateLimits.nameMax + 20) name!: string;
  @IsString() @MaxLength(templateLimits.bodyMax + 100) bodyBs!: string;
  @IsOptional() @IsString() @MaxLength(templateLimits.bodyMax + 100) bodyEn?: string | null;
  @IsIn(kinds) kind!: (typeof kinds)[number];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(templateLimits.tagsMax + 5)
  @IsString({ each: true })
  tags?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(templateLimits.scopeItemsMax)
  @IsString({ each: true })
  serviceIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(templateLimits.scopeItemsMax)
  @IsString({ each: true })
  categoryIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(templateLimits.scopeItemsMax)
  @IsString({ each: true })
  groupIds?: string[];
  /** Required for shared templates (A3); ignored for personal ones. */
  @IsOptional()
  @IsString()
  @MaxLength(templateLimits.reasonMax + 20)
  reason?: string;
}

export class DeleteWithReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(templateLimits.reasonMax + 20)
  reason?: string;
}

/** Definition deletes must carry the revision returned by the management read. */
export class DeleteResponseTemplateDto extends DeleteWithReasonDto {
  @IsOptional() @IsDateString() @MaxLength(40) expectedUpdatedAt?: string;
}

export class DeletePlaybookDto extends DeleteWithReasonDto {
  @IsOptional() @IsDateString() @MaxLength(40) expectedUpdatedAt?: string;
}

export class PreviewResponseTemplateDto {
  @IsString() @MaxLength(templateLimits.bodyMax + 100) body!: string;
  @IsOptional() @IsIn(templateLocales) locale?: 'bs' | 'en';
  @IsOptional() @IsString() @MaxLength(64) ticketId?: string;
}

export class RenderResponseTemplateDto {
  @IsOptional() @IsIn(templateLocales) locale?: 'bs' | 'en';
  /** Val 2 (M13/B1): composer mode — server odbija šablon drugog tipa. */
  @IsOptional() @IsIn(['REPLY', 'INTERNAL']) kind?: 'REPLY' | 'INTERNAL';
}

export class PlaybookStepDto {
  @IsOptional() @IsString() @MaxLength(64) stepKey?: string;
  @IsString() @MaxLength(templateLimits.stepTitleMax + 20) title!: string;
  @IsOptional()
  @IsString()
  @MaxLength(templateLimits.stepInstructionsMax + 20)
  instructions?: string | null;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MaxLength(64) knowledgeArticleId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) responseTemplateId?: string | null;
}

export class SavePlaybookDto {
  @IsString() @MaxLength(templateLimits.nameMax + 20) name!: string;
  @IsOptional()
  @IsString()
  @MaxLength(templateLimits.playbookDescriptionMax + 20)
  description?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(templateLimits.scopeItemsMax)
  @IsString({ each: true })
  serviceIds?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(templateLimits.scopeItemsMax)
  @IsString({ each: true })
  categoryIds?: string[];
  @IsArray()
  @ArrayMaxSize(templateLimits.stepsMax + 5)
  @ValidateNested({ each: true })
  @Type(() => PlaybookStepDto)
  steps!: PlaybookStepDto[];
  /** Required for updates; the exact loaded revision prevents stale replacement. */
  @IsOptional() @IsDateString() @MaxLength(40) expectedUpdatedAt?: string;
  @IsOptional()
  @IsString()
  @MaxLength(templateLimits.reasonMax + 20)
  reason?: string;
}

export class ManagePlaybooksQueryDto extends TemplatesCursorQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsString() @MaxLength(64) serviceId?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'all']) state?: 'active' | 'inactive' | 'all';
}

export class TicketPlaybookCandidatesQueryDto extends TemplatesCursorQueryDto {}

export class AttachTicketPlaybookDto {
  @IsString() @MaxLength(64) playbookId!: string;
}

/**
 * Paket 5.2.4 (M13 B4): bulk-attach one playbook to many tickets. Each ticket
 * is processed independently so a closed ticket or an already-attached ticket
 * cannot abort the whole batch.
 */
export class BulkAttachPlaybookDto {
  @IsString() @MaxLength(64) playbookId!: string;
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  ticketIds!: readonly string[];
}

export class SetTicketPlaybookStepDto {
  @IsBoolean() checked!: boolean;
}
