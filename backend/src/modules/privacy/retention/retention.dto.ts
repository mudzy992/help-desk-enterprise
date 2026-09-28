import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { retentionCategories, type RetentionCategory } from '../privacy.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class RetentionCategoryParamDto {
  @IsIn(retentionCategories)
  category!: RetentionCategory;
}

export class RetentionRunsQueryDto {
  @IsOptional()
  @IsIn(retentionCategories)
  category?: RetentionCategory;
}

export class LegalHoldTargetParamDto {
  @IsIn(['ticket', 'user'])
  target!: 'ticket' | 'user';

  @IsString()
  @MaxLength(40)
  id!: string;
}

export class LegalHoldReasonDto {
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
