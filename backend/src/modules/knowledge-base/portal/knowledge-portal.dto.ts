import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DataClassification } from '../../../generated/prisma/enums';
import { knowledgeBaseConstants } from '../knowledge-base.constants';
import { knowledgeCategoryIcons } from './knowledge-categories';

export class SaveKnowledgeCategoryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,63}$/)
  key?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nameBs?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nameEn?: string;

  @IsOptional()
  @IsIn([...knowledgeCategoryIcons])
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  parentId?: string | null;
}

export class KnowledgePlacementDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  isFaq?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(999)
  faqOrder?: number | null;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;
}

export class KnowledgeReplySourceDto {
  @IsString()
  @MinLength(1)
  ticketId!: string;

  @IsString()
  @MinLength(1)
  messageId!: string;
}

export class CreateArticleFromReplyDto extends KnowledgeReplySourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(knowledgeBaseConstants.maximumTitleLength)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(knowledgeBaseConstants.maximumBodyLength)
  body!: string;

  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @IsString()
  ownerGroupId?: string;

  @IsOptional()
  @IsString()
  reviewerUserId?: string;

  @IsOptional()
  @IsEnum(DataClassification)
  classification?: DataClassification;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;
}
