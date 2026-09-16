import { IsArray, IsString } from 'class-validator';

export class ReplaceRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  readonly permissionKeys!: readonly string[];
}

export class PreviewRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  readonly permissionKeys!: readonly string[];
}
