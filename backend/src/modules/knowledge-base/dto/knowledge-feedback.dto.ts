import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class KnowledgeFeedbackDto {
  /** Legacy thumbs vote (older clients); ignored when `rating` is sent. */
  @IsOptional()
  @IsBoolean()
  isHelpful?: boolean;

  /** Paket 2.9 (K1): 1-5 stars. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /** Only with rating <= 2 ("What is missing?"). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
