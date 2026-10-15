import { IsOptional, IsString, MaxLength } from 'class-validator';
import { installSeedNameLimits } from '../install-seed.names';

/**
 * F2: the structure step sends the names the operator typed. Every field is
 * optional, so `POST /install/seed` without a body keeps the pre-v2 behaviour
 * (`e2e/helpers/ensure-install.ts` relies on it).
 */
export class CreateInstallSeedDto {
  @IsOptional()
  @IsString()
  @MaxLength(installSeedNameLimits.organizationalUnitName)
  organizationalUnitName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(installSeedNameLimits.handlerGroupName)
  handlerGroupName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(installSeedNameLimits.serviceName)
  serviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(installSeedNameLimits.categoryName)
  categoryName?: string;
}
