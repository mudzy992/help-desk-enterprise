import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServiceAvailabilityConfigurationLoader } from '../service-catalog/service-availability-configuration.loader';
import { SettingsModule } from '../settings/settings.module';
import { ChangeAccessService } from './change-access.service';
import { ChangeApprovalsService } from './change-approvals.service';
import { ChangeNotifier } from './change-notifier';
import { ChangeScheduleService } from './change-schedule.service';
import { ChangeTemplatesService } from './change-templates.service';
import { ChangesController } from './changes.controller';
import { ChangesService } from './changes.service';

/** Paket 3.4: change management (behind the private.addons.changes addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule, NotificationsModule],
  controllers: [ChangesController],
  providers: [
    ChangeAccessService,
    ChangesService,
    ChangeTemplatesService,
    ChangeScheduleService,
    ChangeApprovalsService,
    ChangeNotifier,
    ServiceAvailabilityConfigurationLoader,
  ],
  exports: [ChangeAccessService, ChangesService, ChangeScheduleService, ChangeNotifier],
})
export class ChangesModule {}
