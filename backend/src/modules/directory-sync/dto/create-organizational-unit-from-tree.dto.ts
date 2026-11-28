import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  OrganizationalUnitType,
} from '../../../generated/prisma/enums';
import { organizationalUnitConstants } from '../../organizational-units/organizational-unit.constants';

/**
 * W2.36c: deliberately narrow. There is **no** `distinguishedName` and no
 * `parentExternalId`: a client that sends either gets `400` from the global
 * whitelist pipe (`forbidNonWhitelisted`), so the only way to name a unit is by
 * its name and a real tree parent. The server derives everything else.
 */
export class CreateOrganizationalUnitFromTreeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(organizationalUnitConstants.maximumNameLength)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parentOrganizationalUnitId?: string | null;

  @IsOptional()
  @IsEnum(OrganizationalUnitType)
  type?: OrganizationalUnitType;
}
