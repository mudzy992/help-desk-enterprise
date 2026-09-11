import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ticketConstants } from '../../tickets.constants';

export class SplitTicketChildDto {
  @IsOptional()
  @IsString()
  @MaxLength(ticketConstants.maximumTitleLength)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ticketConstants.maximumDescriptionLength)
  description?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  assignedGroupId?: string;

  @IsOptional()
  @IsString({ each: true })
  messageIds?: string[];

  @IsOptional()
  @IsString({ each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsBoolean()
  moveAttachments?: boolean;
}
