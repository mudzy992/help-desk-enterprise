import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { ProblemAccessService } from './problem-access.service';
import { ProblemsController } from './problems.controller';
import { ProblemsService } from './problems.service';

/** Paket 3.3: problem management (behind the private.addons.problems addon). */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule],
  controllers: [ProblemsController],
  providers: [ProblemAccessService, ProblemsService],
  exports: [ProblemAccessService, ProblemsService],
})
export class ProblemsModule {}
