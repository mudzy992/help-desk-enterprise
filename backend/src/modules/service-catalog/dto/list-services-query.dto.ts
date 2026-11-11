import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { ServiceLifecycle } from "../../../generated/prisma/enums";
import { serviceListMaximumTake } from "../service-catalog.constants";

export class ListServicesQueryDto {
  @IsOptional()
  @IsEnum(ServiceLifecycle)
  lifecycle?: ServiceLifecycle;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  offeredOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(128)
  search?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  originUnitId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(serviceListMaximumTake)
  take?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  cursor?: string;
}
