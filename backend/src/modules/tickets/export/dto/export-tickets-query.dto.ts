import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { CreatedRangeOrderedConstraint } from '../../list/created-range.validator';
import {
  TicketPriority,
  TicketStatus,
} from '../../../../generated/prisma/enums';

export class ExportTicketsQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  originUnitId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  serviceId?: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  @MinLength(1)
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  requesterId?: string;

  @IsOptional()
  @IsIn(['true'])
  unassigned?: 'true';

  @IsOptional()
  @IsIn(['true'])
  overdue?: 'true';

  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  @Validate(CreatedRangeOrderedConstraint)
  createdTo?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q?: string;
}
