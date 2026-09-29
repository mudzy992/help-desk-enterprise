import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { OnCallController, PublicOnCallCalendarController } from './on-call.controller';
import { OnCallService } from './on-call.service';

/** Paket 2.9 (K3): on-call schedules, overrides, swaps and the iCal feed. */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule],
  controllers: [OnCallController, PublicOnCallCalendarController],
  providers: [OnCallService],
  exports: [OnCallService],
})
export class OnCallModule {}
