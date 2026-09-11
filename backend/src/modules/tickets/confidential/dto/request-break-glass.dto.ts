import { IsString, MaxLength } from 'class-validator';
import { maximumBreakGlassReasonLength } from '../confidential.constants';

export class RequestBreakGlassDto {
  @IsString()
  @MaxLength(maximumBreakGlassReasonLength)
  reason!: string;
}
