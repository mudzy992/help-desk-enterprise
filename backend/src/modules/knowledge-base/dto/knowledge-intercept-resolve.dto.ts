import { IsOptional, IsString, MinLength } from 'class-validator';

export class KnowledgeInterceptResolveDto {
  @IsString()
  @MinLength(1)
  serviceId!: string;

  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  articleId?: string;
}
