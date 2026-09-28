import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePrivacyExportDto {
  @IsString()
  @MaxLength(40)
  subjectUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  requestId?: string;

  @IsOptional()
  @IsBoolean()
  includeAttachments?: boolean;

  /** Other staff's internal notes about the subject (§5.1) — needs a reason. */
  @IsOptional()
  @IsBoolean()
  includeInternalNotes?: boolean;

  @ValidateIf((dto: CreatePrivacyExportDto) => dto.includeInternalNotes === true)
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  internalNotesReason?: string;
}
