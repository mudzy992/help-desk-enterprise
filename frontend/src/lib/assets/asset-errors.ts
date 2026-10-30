import { ApiError } from "@/services/api";

export const assetErrorKeys = {
  ASSETS_DISABLED: "assets.errors.disabled",
  ASSET_NOT_FOUND: "assets.errors.notFound",
  ASSET_FORBIDDEN: "assets.errors.forbidden",
  ASSET_OUT_OF_SCOPE: "assets.errors.outOfScope",
  ASSET_INVALID: "assets.errors.invalid",
  ASSET_TAG_TAKEN: "assets.errors.tagTaken",
  ASSET_STATUS_TRANSITION: "assets.errors.statusTransition",
  ASSET_REASON_REQUIRED: "assets.errors.reasonRequired",
  ASSET_VERSION_CONFLICT: "assets.errors.versionConflict",
  ASSET_READ_ONLY: "assets.errors.readOnly",
  ASSET_ATTRIBUTE_INVALID: "assets.errors.attributeInvalid",
  ASSET_ATTRIBUTE_NOT_UNIQUE: "assets.errors.attributeNotUnique",
  ASSET_TYPE_NOT_FOUND: "assets.errors.typeNotFound",
  ASSET_TYPE_KEY_TAKEN: "assets.errors.typeKeyTaken",
  ASSET_TYPE_ARCHIVED: "assets.errors.typeArchived",
  ASSET_ATTRIBUTE_KEY_TAKEN: "assets.errors.attributeKeyTaken",
  ASSET_ATTRIBUTE_HAS_VALUES: "assets.errors.attributeHasValues",
  ASSET_LOCATION_NOT_FOUND: "assets.errors.locationNotFound",
  ASSET_LOCATION_CODE_TAKEN: "assets.errors.locationCodeTaken",
  ASSET_LOCATION_IN_USE: "assets.errors.locationInUse",
  ASSET_UNIT_NOT_FOUND: "assets.errors.unitNotFound",
  ASSET_USER_NOT_FOUND: "assets.errors.userNotFound",
  ASSET_SERVICE_NOT_FOUND: "assets.errors.serviceNotFound",
  ASSET_RELATION_EXISTS: "assets.errors.relationExists",
  ASSET_RELATION_CYCLE: "assets.errors.relationCycle",
  ASSET_RELATION_SELF: "assets.errors.relationSelf",
  ASSET_HAS_DEPENDENTS: "assets.errors.hasDependents",
  ASSET_LICENSE_NOT_FOUND: "assets.errors.licenseNotFound",
  ASSET_LICENSE_KEY_UNAVAILABLE: "assets.errors.licenseKeyUnavailable",
  ASSET_LICENSE_ASSIGNMENT_INVALID: "assets.errors.licenseAssignmentInvalid",
  ASSET_LICENSE_ASSIGNMENT_EXISTS: "assets.errors.licenseAssignmentExists",
  ASSET_CONTRACT_NOT_FOUND: "assets.errors.contractNotFound",
  ASSET_CONTRACT_ITEM_EXISTS: "assets.errors.contractItemExists",
  ASSET_IMPORT_FILE_INVALID: "assets.errors.importFileInvalid",
  ASSET_IMPORT_TOO_MANY_ROWS: "assets.errors.importTooManyRows",
  ASSET_IMPORT_FILE_TOO_LARGE: "assets.errors.importFileTooLarge",
  ASSET_IMPORT_MAPPING_INVALID: "assets.errors.importMappingInvalid",
  ASSET_IMPORT_NOT_FOUND: "assets.errors.importNotFound",
  ASSET_IMPORT_EXPIRED: "assets.errors.importExpired",
  ASSET_IMPORT_NOT_PENDING: "assets.errors.importNotPending",
  ASSET_IMPORT_APPLYING: "assets.errors.importApplying",
  ASSET_IMPORT_HAS_ERRORS: "assets.errors.importHasErrors",
  ASSET_EXPORT_TOO_LARGE: "assets.errors.exportTooLarge",
  ASSET_DIRECTORY_SYNC_DISABLED: "assets.errors.directorySyncDisabled",
  ASSET_DIRECTORY_NOT_CONFIGURED: "assets.errors.directoryNotConfigured",
  ASSET_DIRECTORY_UNAVAILABLE: "assets.errors.directoryUnavailable",
  ASSET_TRANSFER_REQUIRED: "assets.errors.transferRequired",
  ASSET_TRANSFER_DISABLED: "assets.errors.transferDisabled",
  ASSET_TRANSFER_INVALID: "assets.errors.transferInvalid",
  ASSET_TRANSFER_NOT_FOUND: "assets.errors.transferNotFound",
  ASSET_TRANSFER_NOT_ISSUED: "assets.errors.transferNotIssued",
  ASSET_TRANSFER_NO_SIGNED_COPY: "assets.errors.transferNoSignedCopy",
  ASSET_TRANSFER_FILE_INVALID: "assets.errors.transferFileInvalid",
  ASSET_TRANSFER_FILE_TOO_LARGE: "assets.errors.transferFileTooLarge",
  ASSET_TRANSFER_FILE_INFECTED: "assets.errors.transferFileInfected",
  ASSET_TRANSFER_SCAN_UNAVAILABLE: "assets.errors.transferScanUnavailable",
  ASSET_TRANSFER_TEMPLATE_INVALID: "assets.errors.transferTemplateInvalid",
  ASSET_TRANSFER_TEMPLATE_NOT_FOUND: "assets.errors.transferTemplateNotFound",
  ASSET_TRANSFER_RENDER_FAILED: "assets.errors.transferRenderFailed",
} as const;

export type AssetErrorKey = (typeof assetErrorKeys)[keyof typeof assetErrorKeys];

export function mapAssetError(error: unknown): AssetErrorKey | null {
  if (!(error instanceof ApiError)) return null;
  return (assetErrorKeys as Readonly<Record<string, AssetErrorKey>>)[error.code] ?? null;
}

/** Server detail (field or `key:problem` list) for invalid-input errors. */
export function assetErrorDetail(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (
    error.code !== "ASSET_INVALID" &&
    error.code !== "ASSET_ATTRIBUTE_INVALID" &&
    error.code !== "ASSET_ATTRIBUTE_NOT_UNIQUE"
  ) {
    return null;
  }
  return error.message && error.message !== error.code ? error.message : null;
}
