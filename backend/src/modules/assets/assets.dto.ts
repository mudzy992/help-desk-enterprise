import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  assetAttributeDataTypes,
  assetCategories,
  assetContractKinds,
  assetContractLimits,
  assetLimits,
  assetRelationKinds,
  assetStatuses,
  softwareLicenseKinds,
} from './assets.constants';

export class SaveAssetDto {
  @IsOptional() @IsString() @MaxLength(64) assetTag?: string | null;
  @IsString() @MaxLength(64) typeId!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsIn(assetStatuses) status?: (typeof assetStatuses)[number];
  @IsOptional() @IsString() @MaxLength(120) serialNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(120) manufacturer?: string | null;
  @IsOptional() @IsString() @MaxLength(120) model?: string | null;
  @IsString() @MaxLength(64) organizationalUnitId!: string;
  @IsOptional() @IsString() @MaxLength(64) locationId?: string | null;
  @IsOptional() @IsString() @MaxLength(64) serviceId?: string | null;
  @IsOptional() @IsString() @MaxLength(32) purchaseDate?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) purchaseCost?: number | null;
  @IsOptional() @IsString() @MaxLength(160) supplier?: string | null;
  @IsOptional() @IsString() @MaxLength(32) warrantyEndsAt?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
  @IsOptional() @IsObject() attributes?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class AssetStatusDto {
  @IsIn(assetStatuses) status!: (typeof assetStatuses)[number];
  @IsOptional() @IsString() @MaxLength(assetLimits.reasonMax) reason?: string;
}

export class AssignAssetDto {
  @IsString() @MaxLength(64) userId!: string;
  @IsOptional() @IsString() @MaxLength(64) organizationalUnitId?: string;
  @IsOptional() @IsString() @MaxLength(assetLimits.reasonMax) note?: string;
}

export class UnassignAssetDto {
  @IsOptional() @IsIn(['IN_STOCK', 'IN_REPAIR', 'IN_USE']) status?: 'IN_STOCK' | 'IN_REPAIR' | 'IN_USE';
  @IsOptional() @IsString() @MaxLength(assetLimits.reasonMax) note?: string;
}

export class AddAssetRelationDto {
  @IsString() @MaxLength(64) toAssetId!: string;
  @IsIn(assetRelationKinds) kind!: (typeof assetRelationKinds)[number];
}

export class SaveAssetTypeDto {
  @IsOptional() @IsString() @MaxLength(48) key?: string;
  @IsString() @MaxLength(80) nameBs!: string;
  @IsString() @MaxLength(80) nameEn!: string;
  @IsString() @MaxLength(32) icon!: string;
  @IsIn(assetCategories) category!: (typeof assetCategories)[number];
  @IsBoolean() isUserSelectable!: boolean;
  /** C9b: handler group for tickets about this type (null = routing rules). */
  @IsOptional() @IsString() @MaxLength(64) routingGroupId?: string | null;
  @IsInt() @Min(0) @Max(9999) sortOrder!: number;
}

export class SaveAssetAttributeDto {
  @IsOptional() @IsString() @MaxLength(48) key?: string;
  @IsString() @MaxLength(80) labelBs!: string;
  @IsString() @MaxLength(80) labelEn!: string;
  @IsIn(assetAttributeDataTypes) dataType!: (typeof assetAttributeDataTypes)[number];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(assetLimits.selectOptionsMax)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  options?: string[];
  @IsBoolean() isRequired!: boolean;
  @IsBoolean() isUnique!: boolean;
  @IsInt() @Min(0) @Max(9999) sortOrder!: number;
}

export class SaveAssetLocationDto {
  @IsOptional() @IsString() @MaxLength(64) parentId?: string | null;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(32) code?: string | null;
  @IsInt() @Min(0) @Max(9999) sortOrder!: number;
}

export class ArchiveDto {
  @IsBoolean() archived!: boolean;
}

export class LinkTicketAssetDto {
  @IsString() @MaxLength(64) assetId!: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class SaveLicenseDto {
  @IsString() @MaxLength(160) productName!: string;
  @IsOptional() @IsString() @MaxLength(120) vendor?: string | null;
  @IsIn(softwareLicenseKinds) kind!: (typeof softwareLicenseKinds)[number];
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) seats?: number | null;
  @IsOptional() @IsString() @MaxLength(32) validUntil?: string | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cost?: number | null;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
  @IsString() @MaxLength(64) organizationalUnitId!: string;
  @IsOptional() @IsString() @MaxLength(assetContractLimits.keyMax) licenseKey?: string | null;
}

export class AssignLicenseDto {
  @IsOptional() @IsString() @MaxLength(64) assetId?: string;
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
}

export class SaveContractDto {
  @IsIn(assetContractKinds) kind!: (typeof assetContractKinds)[number];
  @IsString() @MaxLength(160) supplier!: string;
  @IsOptional() @IsString() @MaxLength(120) reference?: string | null;
  @IsOptional() @IsString() @MaxLength(32) startsAt?: string | null;
  @IsString() @MaxLength(32) endsAt!: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cost?: number | null;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
  @IsString() @MaxLength(64) organizationalUnitId!: string;
}

export class ContractItemDto {
  @IsString() @MaxLength(64) assetId!: string;
}

/** Paket 3.2 (§11): multipart fields of the import preview (strings in multipart). */
export class ImportPreviewDto {
  @IsString() @MaxLength(64) typeId!: string;
  @IsIn(['CREATE_ONLY', 'UPSERT']) mode!: 'CREATE_ONLY' | 'UPSERT';
  @IsOptional() @IsIn(['true', 'false']) allOrNothing?: string;
  /** JSON array, one entry per header: a column key or null. */
  @IsOptional() @IsString() @MaxLength(20_000) mapping?: string;
}
