import { IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReplaceRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  readonly permissionKeys!: readonly string[];

  /**
   * Paket 5.1 (M4 B2): the token returned by the impact preview
   * (`POST /roles/:roleKey/permissions/preview`). RAW `:231–232` does not allow
   * a permission change without that review.
   */
  @IsString()
  @IsNotEmpty()
  readonly previewToken!: string;

  /** Paket 5.1 (M4 B2): why the change is made — goes into the change log. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  readonly reason!: string;
}

export class PreviewRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  readonly permissionKeys!: readonly string[];
}
