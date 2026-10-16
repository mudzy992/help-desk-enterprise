import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SetupChecklistController } from './setup-checklist.controller';
import { SetupChecklistService } from './setup-checklist.service';

/**
 * Install wizard v2 (F6.3): a module of its own, because the checklist belongs to
 * the running installation (dashboard, Settings) and not to the wizard: the
 * wizard's controllers sit behind `InstallWizardLockGuard`, which locks them the
 * moment the installation finishes — exactly when this module starts to matter.
 *
 * `PrismaService` is global; `SettingsService` comes from `SettingsModule`.
 */
@Module({
  imports: [SettingsModule],
  controllers: [SetupChecklistController],
  providers: [SetupChecklistService],
})
export class SetupChecklistModule {}
