import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ServiceLifecycle } from '../../../generated/prisma/enums';

export class ListServicesQueryDto {
  @IsOptional()
  @IsEnum(ServiceLifecycle)
  lifecycle?: ServiceLifecycle;

  @IsOptional()
  @IsString()
  @MinLength(1)
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  offeredOnly?: boolean;
}
