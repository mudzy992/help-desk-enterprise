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

  /**
   * M5 B3: the pack may be assigned to a service, to an OU, or to both — which
   * one the pack needs is decided by its grant scopes
   * (`plan-policy-pack-apply.ts`), so the field is optional here.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  organizationalUnitId?: string;

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
