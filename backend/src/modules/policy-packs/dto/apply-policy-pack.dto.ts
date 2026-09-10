import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ApplyPolicyPackDto {
  @IsString()
  @MinLength(1)
  packKey!: string;

  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @Type(() => String)
  userIds?: string[];
}
