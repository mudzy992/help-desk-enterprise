import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { knowledgeBaseConstants } from '../knowledge-base.constants';

export class KnowledgeInterceptDto {
  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(knowledgeBaseConstants.maximumQueryLength)
  query?: string;
}
