import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { groupsConstants } from '../groups.constants';

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(groupsConstants.maximumNameLength)
  name!: string;

  @IsString()
  @MinLength(1)
  organizationalUnitId!: string;

  @IsOptional()
  @IsBoolean()
  isFallback?: boolean;

  @IsOptional()
  @IsBoolean()
  isProblemGroup?: boolean;

  /** Paket 3.4: change advisory board group. */
  @IsOptional()
  @IsBoolean()
  isCabGroup?: boolean;
}
