import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AddTicketLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  ticketNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class MentionCandidatesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}
