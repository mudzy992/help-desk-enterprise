import { IsEnum, IsOptional, IsString } from 'class-validator';
import { KnowledgeArticleStatus } from '../../../generated/prisma/enums';

export class ListKnowledgeArticlesQueryDto {
  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsEnum(KnowledgeArticleStatus)
  status?: KnowledgeArticleStatus;
}
