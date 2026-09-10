import { Type } from 'class-transformer';
import { IsDefined, IsIn, ValidateNested } from 'class-validator';
import { directorySyncConstants } from '../directory-sync.constants';
import { DirectoryReadScopeDto } from './directory-read-scope.dto';

export class DirectoryReadDto {
  @IsIn([...directorySyncConstants.operations])
  operation!: (typeof directorySyncConstants.operations)[number];

  @IsDefined()
  @ValidateNested()
  @Type(() => DirectoryReadScopeDto)
  scope!: DirectoryReadScopeDto;
}
