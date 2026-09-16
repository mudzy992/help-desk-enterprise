import { IsOptional, IsString, MinLength } from 'class-validator';

export class ListGroupsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  organizationalUnitId?: string;
}
