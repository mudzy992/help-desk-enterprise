import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ticketSavedViewConstants } from '../saved-views.constants';
import type { SavedViewFilters, SavedViewSort, UpdateSavedViewInput } from '../saved-views.types';

export class UpdateSavedViewDto implements UpdateSavedViewInput {
  @IsOptional()
  @IsString()
  @MaxLength(ticketSavedViewConstants.maximumNameLength)
  name?: string;

  @IsOptional()
  @IsObject()
  filters?: SavedViewFilters;

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
