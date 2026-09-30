import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { assetTransferLimits, assetTransferScenarios, type AssetTransferScenarioValue } from './plan-asset-transfer';

/** Paket 3.2 C9 (§7a): one equipment move (and its transfer record). */
export class AssetMovementDto {
  @IsIn(assetTransferScenarios) scenario!: AssetTransferScenarioValue;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(assetTransferLimits.itemsMax)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  assetIds!: string[];
  @IsOptional() @IsString() @MaxLength(64) toUserId?: string;
  @IsOptional() @IsString() @MaxLength(assetTransferLimits.labelMax) fromLabel?: string;
  @IsOptional() @IsString() @MaxLength(assetTransferLimits.labelMax) toLabel?: string;
  @IsOptional() @IsString() @MaxLength(64) organizationalUnitId?: string;
  @IsOptional() @IsString() @MaxLength(64) locationId?: string;
  @IsOptional() @IsIn(['IN_STOCK', 'IN_REPAIR']) returnStatus?: 'IN_STOCK' | 'IN_REPAIR';
  @IsOptional() @IsString() @MaxLength(assetTransferLimits.noteMax) note?: string;
  @IsOptional() @IsBoolean() issueDocument?: boolean;
  @IsOptional() @IsString() @MaxLength(64) signatoryUserId?: string;
}

export class CancelTransferDto {
  @IsString() @MinLength(assetTransferLimits.cancelReasonMin) @MaxLength(assetTransferLimits.cancelReasonMax) reason!: string;
}

export class SaveSignatoryDto {
  @IsString() @MaxLength(64) userId!: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
}

export class UploadTemplateDto {
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
