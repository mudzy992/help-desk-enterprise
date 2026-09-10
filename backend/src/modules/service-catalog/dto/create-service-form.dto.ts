import { IsObject } from 'class-validator';

export class CreateServiceFormDto {
  @IsObject()
  schema!: Record<string, unknown>;
}
