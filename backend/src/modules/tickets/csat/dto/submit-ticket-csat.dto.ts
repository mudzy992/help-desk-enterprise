import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { csatConstants } from '../csat.constants';

export class SubmitTicketCsatDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(csatConstants.maximumScaleMax)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(csatConstants.maximumCommentLength)
  comment?: string;
}
