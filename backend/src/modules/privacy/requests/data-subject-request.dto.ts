import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  dataSubjectRequestChannels,
  dataSubjectRequestTypes,
  type DataSubjectRequestChannel,
  type DataSubjectRequestType,
} from '../privacy.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateDataSubjectRequestDto {
  @IsIn(dataSubjectRequestTypes)
  type!: DataSubjectRequestType;

  @IsIn(dataSubjectRequestChannels)
  channel!: DataSubjectRequestChannel;

  /** When the request reached the controller (may be in the past, e.g. a letter). */
  @IsDateString()
  receivedAt!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subjectLabel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  subjectUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  handlerUserId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class UpdateDataSubjectRequestDto {
  @IsOptional()
  @IsIn(['IN_PROGRESS'])
  status?: 'IN_PROGRESS';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  subjectUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  handlerUserId?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class ExtendDataSubjectRequestDto {
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class CloseDataSubjectRequestDto {
  @IsIn(['COMPLETED', 'REJECTED'])
  outcome!: 'COMPLETED' | 'REJECTED';

  /** Required for REJECTED (ZZLP čl. 14(4)): the reason told to the subject. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  resultRef?: string;
}

export class ListDataSubjectRequestsQueryDto {
  @IsOptional()
  @IsIn(['open', 'closed', 'all'])
  scope?: 'open' | 'closed' | 'all';
}
