import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  installBlueprintLocales,
  type InstallBlueprintLocale,
} from '../blueprints/install-blueprint.types';

/**
 * F4.2: the catalog step sends the blueprint it rendered, the request types the
 * operator left switched on, whether the L1/L2 groups are wanted, and the locale
 * the names are read in (the locale decides what the created rows are called).
 */
export class ApplyInstallBlueprintDto {
  @IsString()
  @Length(1, 64)
  blueprintKey!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsString({ each: true })
  @Length(1, 64, { each: true })
  includeServices?: readonly string[];

  @IsOptional()
  @IsBoolean()
  createTierGroups?: boolean;

  @IsOptional()
  @IsIn(installBlueprintLocales)
  locale?: InstallBlueprintLocale;
}

/** `GET /install/blueprints?locale=bs` — the UI's current language. */
export class InstallBlueprintCatalogQueryDto {
  @IsOptional()
  @IsIn(installBlueprintLocales)
  locale?: InstallBlueprintLocale;
}
