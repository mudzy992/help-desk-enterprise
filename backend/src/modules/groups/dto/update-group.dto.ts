import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { groupsConstants } from '../groups.constants';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(groupsConstants.maximumNameLength)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isFallback?: boolean;

  /** Paket 3.3: marks the group as a problem-management group. */
  @IsOptional()
  @IsBoolean()
  isProblemGroup?: boolean;

  /** Paket 3.4: change advisory board group. */
  @IsOptional()
  @IsBoolean()
  isCabGroup?: boolean;
}
