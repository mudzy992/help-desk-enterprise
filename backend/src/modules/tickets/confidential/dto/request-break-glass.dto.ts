import { IsString, IsUUID, MaxLength } from 'class-validator';
import { maximumBreakGlassReasonLength } from '../confidential.constants';

export class RequestBreakGlassDto {
  @IsUUID('4')
  correlationId!: string;

  @IsString()
  @MaxLength(maximumBreakGlassReasonLength)
  reason!: string;
}
