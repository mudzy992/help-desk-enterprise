import { IsString, MinLength } from 'class-validator';

export class LinkUserDirectoryIdentityDto {
  @IsString()
  @MinLength(1)
  directoryExternalId!: string;
}
