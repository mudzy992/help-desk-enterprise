import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DataClassification } from '../../../generated/prisma/enums';
import { knowledgeBaseConstants } from '../knowledge-base.constants';

export class CreateKnowledgeArticleDto {
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

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;
}
