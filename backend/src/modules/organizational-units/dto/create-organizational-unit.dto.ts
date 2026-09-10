import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { OrganizationalUnitType } from '../../../generated/prisma/enums';
import { organizationalUnitConstants } from '../organizational-unit.constants';

export class CreateOrganizationalUnitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(organizationalUnitConstants.maximumNameLength)
  name!: string;

  @IsEnum(OrganizationalUnitType)
  type!: OrganizationalUnitType;

  @IsString()
  @MinLength(1)
  @MaxLength(organizationalUnitConstants.maximumDistinguishedNameLength)
  distinguishedName!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  parentId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(organizationalUnitConstants.maximumOptionalAttributeLength)
  company?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(organizationalUnitConstants.maximumOptionalAttributeLength)
  department?: string | null;
}
