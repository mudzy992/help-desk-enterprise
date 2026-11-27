import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { permissionCatalogEntries } from '../../authorization/permission-catalog';

/**
 * W2.34 (`BA-rbac-07`): the DTO used to check only the *type* of the input, so an
 * authenticated SuperAdmin client could send a huge array, a huge key or a huge
 * token and the service would do the work (catalog lookup, HMAC, JSON parse)
 * before rejecting it. The global 512 kB body limit is the outer layer; these are
 * the limits that belong to this contract.
 */
/**
 * A role cannot hold more permissions than the catalog contains. The array is
 * allowed to be redundant (the service rejects the write anyway) but it cannot
 * be unbounded.
 */
export const permissionKeysMaxCount = permissionCatalogEntries.length;
/**
 * Catalog keys are short (`ticket.forward.cross-ou` is 23 characters). 120 leaves
 * room for a future naming convention without letting a key carry a payload.
 */
export const permissionKeyMaxLength = 120;
/**
 * The preview token is `base64url(payload).base64url(hmac)`. Its worst realistic
 * case is the full catalog on both sides (baseline + proposed) at the key length
 * ceiling: `2 × 72 × (120 + 3)` ≈ 18 kB of JSON → ≈ 24 kB base64url, plus the
 * signature. 32 KiB is above that ceiling and far below the body limit.
 */
export const previewTokenMaxLength = 32_768;

export class ReplaceRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(permissionKeysMaxCount)
  @IsString({ each: true })
  @MaxLength(permissionKeyMaxLength, { each: true })
  readonly permissionKeys!: readonly string[];

  /**
   * Paket 5.1 (M4 B2): the token returned by the impact preview
   * (`POST /roles/:roleKey/permissions/preview`). RAW `:231–232` does not allow
   * a permission change without that review.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(previewTokenMaxLength)
  readonly previewToken!: string;

  /** Paket 5.1 (M4 B2): why the change is made — goes into the change log. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  readonly reason!: string;
}

export class PreviewRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(permissionKeysMaxCount)
  @IsString({ each: true })
  @MaxLength(permissionKeyMaxLength, { each: true })
  readonly permissionKeys!: readonly string[];
}
