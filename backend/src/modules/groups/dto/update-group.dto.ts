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
}
