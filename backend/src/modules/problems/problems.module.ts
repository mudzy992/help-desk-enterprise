import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ProblemTicketsService } from './problem-tickets.service';
import { ProblemResolutionService } from './problem-resolution.service';
import { ProblemAccessService } from './problem-access.service';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';

/** Paket 3.3: problem management (behind the private.addons.problems addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule, TicketsModule],
  controllers: [ProblemsController],
  providers: [ProblemAccessService, ProblemsService, ProblemTicketsService, ProblemResolutionService],
  exports: [ProblemAccessService, ProblemsService, ProblemTicketsService],
})
export class ProblemsModule {}
