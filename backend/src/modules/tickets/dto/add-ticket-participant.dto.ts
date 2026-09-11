import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ParticipantRole } from '../../../generated/prisma/enums';

export class AddTicketParticipantDto {
  @IsEnum(ParticipantRole)
  role!: ParticipantRole;

  @IsOptional()
  @IsString()
  @MinLength(1)
  userId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  groupId?: string;
}
