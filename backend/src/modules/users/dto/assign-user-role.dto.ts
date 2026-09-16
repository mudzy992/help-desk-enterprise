import { IsOptional, IsString } from 'class-validator';

export class AssignUserRoleDto {
  @IsString()
  readonly roleKey!: string;

  @IsOptional()
  @IsString()
  readonly organizationalUnitId?: string;

  @IsOptional()
  @IsString()
  readonly serviceId?: string;
}
