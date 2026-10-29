import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ticketPriorityLevels,
  ticketStatuses,
} from '../../tickets.constants';
import { ticketBulkConstants } from '../bulk.constants';
import { ticketBulkActionTypes } from '../bulk.types';
import type {
  ExecuteTicketBulkInput,
  TicketBulkActionType,
} from '../bulk.types';

export class ExecuteTicketBulkDto implements ExecuteTicketBulkInput {
  @IsUUID('4')
  operationId!: string;

  @IsIn(['atomic', 'best-effort'])
  mode!: 'atomic' | 'best-effort';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ticketBulkConstants.maximumTicketIds)
  @IsString({ each: true })
  ticketIds!: string[];

  @IsIn(ticketBulkActionTypes)
  actionType!: TicketBulkActionType;

  @IsOptional()
  @IsString()
  assignedGroupId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsIn(ticketStatuses)
  status?: ExecuteTicketBulkInput['status'];

  @IsOptional()
  @IsIn(ticketPriorityLevels)
  priority?: ExecuteTicketBulkInput['priority'];

  @IsOptional()
  @IsString()
  @MaxLength(ticketBulkConstants.maximumReasonLength)
  reason?: string;

  @IsOptional()
  @IsString()
  parentTicketId?: string;

  @IsOptional()
  @IsBoolean()
  previewConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  broadcastConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(ticketBulkConstants.maximumBroadcastFieldLength)
  whatHappened?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ticketBulkConstants.maximumBroadcastFieldLength)
  whoAffected?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ticketBulkConstants.maximumBroadcastFieldLength)
  eta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ticketBulkConstants.maximumBroadcastFieldLength)
  workaround?: string;
}
