import { IsOptional, IsString, MinLength } from 'class-validator';

export class RoutingPreviewDto {
  /** Optional: defaults to the requester's home unit, like ticket creation does. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  originUnitId?: string;

  @IsString()
  @MinLength(1)
  serviceId!: string;
}
