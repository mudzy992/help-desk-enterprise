import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { SetupChecklistController } from './setup-checklist.controller';
import { SetupChecklistService } from './setup-checklist.service';

/**
 * Install wizard v2 (F6.3): a module of its own, because the checklist belongs to
 * the running installation (dashboard, Settings) and not to the wizard: the
 * wizard's controllers sit behind `InstallWizardLockGuard`, which locks them the
 * moment the installation finishes — exactly when this module starts to matter.
 *
 * `PrismaService` is global; `SettingsService` comes from `SettingsModule`, and
 * the controller's guard chain needs the two modules that own it:
 * `SessionAuthenticationGuard` (session token + principal context) from
 * `AuthenticationModule` and `RoleGuard` (roles and permissions) from
 * `AuthorizationModule`. Guards in `@UseGuards(...)` are instantiated in the
 * injector of the module that declares the controller, so importing only
 * `SettingsModule` compiles the unit tests by hand and still dies in
 * `app.module.spec.ts` with "Nest can't resolve dependencies of the
 * SessionAuthenticationGuard".
 */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule],
  controllers: [SetupChecklistController],
  providers: [SetupChecklistService],
})
export class SetupChecklistModule {}
