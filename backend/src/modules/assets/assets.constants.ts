/** Paket 3.2 (CMDB): shared constants, errors and the pure rules. */

export const assetErrorCodes = {
  disabled: 'ASSETS_DISABLED',
  notFound: 'ASSET_NOT_FOUND',
  forbidden: 'ASSET_FORBIDDEN',
  outOfScope: 'ASSET_OUT_OF_SCOPE',
  invalid: 'ASSET_INVALID',
  tagTaken: 'ASSET_TAG_TAKEN',
  statusTransition: 'ASSET_STATUS_TRANSITION',
  reasonRequired: 'ASSET_REASON_REQUIRED',
  versionConflict: 'ASSET_VERSION_CONFLICT',
  readOnly: 'ASSET_READ_ONLY',
  attributeInvalid: 'ASSET_ATTRIBUTE_INVALID',
  attributeNotUnique: 'ASSET_ATTRIBUTE_NOT_UNIQUE',
  typeNotFound: 'ASSET_TYPE_NOT_FOUND',
  typeKeyTaken: 'ASSET_TYPE_KEY_TAKEN',
  typeArchived: 'ASSET_TYPE_ARCHIVED',
  attributeKeyTaken: 'ASSET_ATTRIBUTE_KEY_TAKEN',
  attributeHasValues: 'ASSET_ATTRIBUTE_HAS_VALUES',
  locationNotFound: 'ASSET_LOCATION_NOT_FOUND',
  locationCodeTaken: 'ASSET_LOCATION_CODE_TAKEN',
  locationInUse: 'ASSET_LOCATION_IN_USE',
  unitNotFound: 'ASSET_UNIT_NOT_FOUND',
  userNotFound: 'ASSET_USER_NOT_FOUND',
  serviceNotFound: 'ASSET_SERVICE_NOT_FOUND',
  relationExists: 'ASSET_RELATION_EXISTS',
  relationCycle: 'ASSET_RELATION_CYCLE',
  relationSelf: 'ASSET_RELATION_SELF',
  hasDependents: 'ASSET_HAS_DEPENDENTS',
  licenseNotFound: 'ASSET_LICENSE_NOT_FOUND',
  licenseKeyUnavailable: 'ASSET_LICENSE_KEY_UNAVAILABLE',
  licenseAssignmentInvalid: 'ASSET_LICENSE_ASSIGNMENT_INVALID',
  licenseAssignmentExists: 'ASSET_LICENSE_ASSIGNMENT_EXISTS',
  contractNotFound: 'ASSET_CONTRACT_NOT_FOUND',
  contractItemExists: 'ASSET_CONTRACT_ITEM_EXISTS',
  importFileInvalid: 'ASSET_IMPORT_FILE_INVALID',
  importTooManyRows: 'ASSET_IMPORT_TOO_MANY_ROWS',
  importFileTooLarge: 'ASSET_IMPORT_FILE_TOO_LARGE',
  importMappingInvalid: 'ASSET_IMPORT_MAPPING_INVALID',
  importNotFound: 'ASSET_IMPORT_NOT_FOUND',
  importExpired: 'ASSET_IMPORT_EXPIRED',
  importNotPending: 'ASSET_IMPORT_NOT_PENDING',
  importHasErrors: 'ASSET_IMPORT_HAS_ERRORS',
  exportTooLarge: 'ASSET_EXPORT_TOO_LARGE',
  directorySyncDisabled: 'ASSET_DIRECTORY_SYNC_DISABLED',
  directoryNotConfigured: 'ASSET_DIRECTORY_NOT_CONFIGURED',
  directoryUnavailable: 'ASSET_DIRECTORY_UNAVAILABLE',
} as const;

export type AssetErrorCode = (typeof assetErrorCodes)[keyof typeof assetErrorCodes];

export class AssetError extends Error {
  constructor(
    readonly code: AssetErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = 'AssetError';
  }
}

export const assetStatuses = ['ORDERED', 'IN_STOCK', 'IN_USE', 'IN_REPAIR', 'LOST', 'RETIRED', 'DISPOSED'] as const;
export type AssetStatusValue = (typeof assetStatuses)[number];

export const assetCategories = ['HARDWARE', 'SOFTWARE', 'NETWORK', 'INFRASTRUCTURE', 'OTHER'] as const;
export const assetAttributeDataTypes = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'] as const;
export type AssetAttributeDataTypeValue = (typeof assetAttributeDataTypes)[number];

export const assetRelationKinds = ['DEPENDS_ON', 'INSTALLED_ON', 'CONNECTED_TO', 'RUNS_ON', 'PART_OF'] as const;
export type AssetRelationKindValue = (typeof assetRelationKinds)[number];

/** Directed kinds form a dependency graph that must stay acyclic (§6). */
export const directedAssetRelationKinds: readonly AssetRelationKindValue[] = ['DEPENDS_ON', 'RUNS_ON', 'PART_OF', 'INSTALLED_ON'];

/** Icon names the frontend knows (same idea as the knowledge categories). */
export const assetTypeIconNames = [
  'box',
  'monitor',
  'laptop',
  'printer',
  'smartphone',
  'tablet',
  'router',
  'server',
  'cloud',
  'app-window',
  'keyboard',
  'hard-drive',
  'camera',
  'phone',
  'key-round',
  'cpu',
] as const;

/**
 * §5: allowed status changes. DISPOSED is final; every status except
 * DISPOSED may go to LOST; a lost item may be found (IN_STOCK).
 */
export const assetStatusTransitions: Readonly<Record<AssetStatusValue, readonly AssetStatusValue[]>> = {
  ORDERED: ['IN_STOCK', 'IN_USE', 'RETIRED', 'LOST'],
  IN_STOCK: ['IN_USE', 'IN_REPAIR', 'RETIRED', 'LOST'],
  IN_USE: ['IN_STOCK', 'IN_REPAIR', 'RETIRED', 'LOST'],
  IN_REPAIR: ['IN_STOCK', 'IN_USE', 'RETIRED', 'LOST'],
  LOST: ['IN_STOCK', 'RETIRED'],
  RETIRED: ['IN_STOCK', 'DISPOSED'],
  DISPOSED: [],
};

/** A reason is mandatory for these target statuses (§5). */
export const assetStatusesNeedingReason: readonly AssetStatusValue[] = ['LOST', 'RETIRED', 'DISPOSED'];

/** Statuses in which the item may be assigned to a user. */
export const assetAssignableStatuses: readonly AssetStatusValue[] = ['ORDERED', 'IN_STOCK', 'IN_USE', 'IN_REPAIR'];

/** A USER sees and picks own items in these statuses (§8). */
export const assetUserVisibleStatuses: readonly AssetStatusValue[] = ['IN_USE', 'IN_REPAIR'];

export function canTransitionAssetStatus(from: AssetStatusValue, to: AssetStatusValue): boolean {
  return from === to || assetStatusTransitions[from].includes(to);
}

export const assetLimits = {
  listPageMax: 100,
  listPageDefault: 50,
  searchMin: 2,
  relationDepthMax: 10,
  impactDepth: 3,
  historyPage: 100,
  attributesPerType: 40,
  selectOptionsMax: 100,
  reasonMax: 500,
  pickerMax: 50,
  /** Location tree depth, e.g. Direkcija › ED Zenica › Visoko › Kancelarija 12. */
  locationDepthMax: 6,
} as const;

export const assetEventActions = {
  created: 'created',
  updated: 'updated',
  status: 'status',
  assigned: 'assigned',
  unassigned: 'unassigned',
  relationAdded: 'relation_added',
  relationRemoved: 'relation_removed',
  ticketLinked: 'ticket_linked',
  ticketUnlinked: 'ticket_unlinked',
  licenseAssigned: 'license_assigned',
  licenseReleased: 'license_released',
  contractLinked: 'contract_linked',
  contractUnlinked: 'contract_unlinked',
  imported: 'imported',
  directorySync: 'directory_sync',
  anonymized: 'anonymized',
} as const;

/** Lowercase slug keys for types (never change after creation). */
export const assetKeyPattern = /^[a-z][a-z0-9-]{1,47}$/;
/** Attribute keys are camelCase identifiers (used as JSON keys and import columns). */
export const assetAttributeKeyPattern = /^[a-z][A-Za-z0-9]{0,47}$/;

/** §9 */
export const softwareLicenseKinds = ['PER_DEVICE', 'PER_USER', 'SITE', 'SUBSCRIPTION'] as const;
export type SoftwareLicenseKindValue = (typeof softwareLicenseKinds)[number];

/** §10 */
export const assetContractKinds = ['WARRANTY', 'SUPPORT', 'LEASE', 'MAINTENANCE'] as const;
export type AssetContractKindValue = (typeof assetContractKinds)[number];

export const assetContractLimits = {
  listMax: 200,
  itemsPerContract: 500,
  assignmentsPerLicense: 5000,
  keyMax: 500,
} as const;
