import { IsOptional, IsString } from 'class-validator';

export class EdgeExtensionBootstrapQueryDto {
  @IsOptional()
  @IsString()
  extensionVersion?: string;
}
