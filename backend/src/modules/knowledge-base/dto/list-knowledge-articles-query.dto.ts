import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { KnowledgeArticleStatus } from '../../../generated/prisma/enums';
import { knowledgeBaseConstants } from '../knowledge-base.constants';

export class ListKnowledgeArticlesQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string;

  @IsOptional()
  @IsEnum(KnowledgeArticleStatus)
  status?: KnowledgeArticleStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  organizationalUnitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(knowledgeBaseConstants.maximumQueryLength)
  q?: string;
}
