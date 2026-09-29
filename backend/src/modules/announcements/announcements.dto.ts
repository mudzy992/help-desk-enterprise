import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { announcementLimits, announcementRoleKeys } from './announcements.constants';

export class AnnouncementAudienceDto {
  @IsArray() @ArrayMaxSize(4) @IsIn(announcementRoleKeys, { each: true }) roles!: string[];
  @IsArray()
  @ArrayMaxSize(announcementLimits.audienceFilterMax)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  organizationalUnitIds!: string[];
  @IsArray()
  @ArrayMaxSize(announcementLimits.audienceFilterMax)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  groupIds!: string[];
}

export class SaveAnnouncementDto extends AnnouncementAudienceDto {
  @IsString() @Length(3, announcementLimits.titleMax) title!: string;
  @IsString() @Length(1, announcementLimits.bodyMax) body!: string;
  @IsIn(['INFO', 'WARNING', 'CRITICAL']) severity!: 'INFO' | 'WARNING' | 'CRITICAL';
  @IsIn(['BANNER', 'MODAL']) displayMode!: 'BANNER' | 'MODAL';
  @IsBoolean() requiresAcknowledgement!: boolean;
  @IsBoolean() notifyAudience!: boolean;
  @IsOptional() @IsBoolean() sendEmail?: boolean;
  @IsOptional() @IsBoolean() postToTeams?: boolean;
  @IsISO8601() @MaxLength(40) startsAt!: string;
  @IsISO8601() @MaxLength(40) endsAt!: string;
  @IsOptional() @IsString() @MaxLength(64) serviceId?: string | null;
}

export class AnnouncementReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}
