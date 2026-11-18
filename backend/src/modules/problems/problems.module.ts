import { Module } from '@nestjs/common';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ProblemHandoffService } from './problem-handoff.service';
import { ProblemLinksService } from './problem-links.service';
import { ProblemTicketsService } from './problem-tickets.service';
import { ProblemNotifier } from './problem-notifier';
import { ProblemNoticeService } from './problem-notice.service';
import { ProblemResolutionRunService } from './problem-resolution-run.service';
import { ProblemTargetReminderService } from './problem-target-reminder.service';
import { ProblemResolutionService } from './problem-resolution.service';
import { ProblemAccessService } from './problem-access.service';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';

/** Paket 3.3: problem management (behind the private.addons.problems addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule, TicketsModule, NotificationsModule, OutboxModule],
  controllers: [ProblemsController],
  providers: [
    ProblemAccessService,
    ProblemsService,
    ProblemTicketsService,
    ProblemResolutionRunService,
    ProblemResolutionService,
    ProblemNotifier,
    // W7.42 (BA-problems-21): writes the notice intent; the worker delivers it.
    ProblemNoticeService,
    ProblemTargetReminderService,
    ProblemLinksService,
    ProblemHandoffService,
  ],
  exports: [ProblemAccessService, ProblemsService, ProblemTicketsService],
})
export class ProblemsModule {}
