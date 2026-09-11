import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DataClassification } from '../../../generated/prisma/enums';
import { knowledgeBaseConstants } from '../knowledge-base.constants';

export class UpdateKnowledgeArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(knowledgeBaseConstants.maximumTitleLength)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(knowledgeBaseConstants.maximumBodyLength)
  body?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  ownerUserId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  ownerGroupId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  reviewerUserId?: string | null;

  @IsOptional()
  @IsEnum(DataClassification)
  classification?: DataClassification;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;
}
