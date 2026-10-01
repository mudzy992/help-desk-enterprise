import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { ChangeAccessService } from './change-access.service';
import { ChangeTemplatesService } from './change-templates.service';
import { ChangesController } from './changes.controller';
import { ChangesService } from './changes.service';

/** Paket 3.4: change management (behind the private.addons.changes addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule],
  controllers: [ChangesController],
  providers: [ChangeAccessService, ChangesService, ChangeTemplatesService],
  exports: [ChangeAccessService, ChangesService],
})
export class ChangesModule {}
