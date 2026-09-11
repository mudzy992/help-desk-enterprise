import { IsObject } from 'class-validator';
import type { SaveInstallAddonsInput } from '../install-addons.types';

export class SaveInstallAddonsDto implements SaveInstallAddonsInput {
  @IsObject()
  addons!: Record<string, boolean>;
}
