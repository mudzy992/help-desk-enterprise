import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrganizationalUnitType } from '../../../generated/prisma/enums';
import { directorySyncConstants } from '../directory-sync.constants';
import type { UpdateManualDirectoryOrganizationalUnitInput } from '../manual-directory-catalog.types';

export class UpdateManualDirectoryOrganizationalUnitDto
  implements UpdateManualDirectoryOrganizationalUnitInput
{
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  parentExternalId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(directorySyncConstants.maximumDistinguishedNameLength)
  distinguishedName?: string | null;

  @IsOptional()
  @IsEnum(OrganizationalUnitType)
  type?: OrganizationalUnitType;
}
