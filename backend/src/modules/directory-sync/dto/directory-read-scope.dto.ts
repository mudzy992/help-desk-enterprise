import {
  IsBoolean,
  IsDefined,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { directorySyncConstants } from '../directory-sync.constants';

export class DirectoryReadScopeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(directorySyncConstants.maximumDistinguishedNameLength)
  distinguishedName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(directorySyncConstants.maximumOrganizationalUnitPathLength)
  organizationalUnitPath?: string;

  @IsDefined()
  @IsBoolean()
  includeSubtree!: boolean;
}
