import { Transform } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { serviceFormVersionsMaximumTake } from "../service-forms.constants";

export class ListServiceFormVersionsQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(serviceFormVersionsMaximumTake)
  take?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  cursor?: string;
}
