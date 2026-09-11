import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ticketSavedViewConstants } from '../saved-views.constants';
import type { CreateSavedViewInput, SavedViewFilters, SavedViewSort } from '../saved-views.types';

export class CreateSavedViewDto implements CreateSavedViewInput {
  @IsString()
  @MaxLength(ticketSavedViewConstants.maximumNameLength)
  name!: string;

  @IsObject()
  filters!: SavedViewFilters;

  @IsOptional()
  @IsObject()
  sort?: SavedViewSort | null;

  @IsOptional()
  @IsString({ each: true })
  columns?: string[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
