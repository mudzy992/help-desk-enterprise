import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * M5 B5 (val 5): the reverse of apply. The target is mandatory (an OU, a
 * service, or both) — the API refuses a request that names neither, because
 * "unapply everywhere" is not a thing this module does.
 */
export class UnapplyPolicyPackDto {
  @IsString()
  @MinLength(1)
  packKey!: string;

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
  @IsString({ each: true })
  userIds?: readonly string[];
}
