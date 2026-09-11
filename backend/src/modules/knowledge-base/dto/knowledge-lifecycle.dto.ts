import { IsString, MaxLength, MinLength } from 'class-validator';

export class KnowledgeLifecycleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  reason!: string;
}
