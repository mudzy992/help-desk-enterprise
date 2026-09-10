import { IsObject } from 'class-validator';

export class CreateServiceFormVersionDto {
  @IsObject()
  schema!: Record<string, unknown>;
}
