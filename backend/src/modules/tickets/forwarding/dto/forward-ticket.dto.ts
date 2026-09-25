import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ticketForwardingConstants } from '../forwarding.constants';
import type { ForwardTicketInput } from '../forwarding.types';

export class ForwardTicketDto implements ForwardTicketInput {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetGroupId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ticketForwardingConstants.maximumReasonLength)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  keepMeAsWatcher?: boolean;
}

export class ForwardTargetsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
