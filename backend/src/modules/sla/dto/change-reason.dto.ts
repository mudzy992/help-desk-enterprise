import { IsString, MaxLength, MinLength } from 'class-validator';
import { maximumChangeReasonLength } from '../../change-log/change-log.constants';

export class ChangeReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(maximumChangeReasonLength)
  reason!: string;
}
