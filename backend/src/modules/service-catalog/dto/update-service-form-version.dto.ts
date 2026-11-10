import { IsObject } from 'class-validator';

export class UpdateServiceFormVersionDto {
  @IsObject()
  schema!: Record<string, unknown>;
}
