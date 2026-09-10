import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationContextLoader } from './authorization-context.loader';
import { AuthorizationService } from './authorization.service';
import { OuAccessGuard } from './ou-access.guard';
import { RoleGuard } from './role.guard';

@Module({
  imports: [AuthenticationModule],
  providers: [
    AuthorizationContextLoader,
    AuthorizationService,
    RoleGuard,
    OuAccessGuard,
  ],
  exports: [AuthorizationService, RoleGuard, OuAccessGuard],
})
export class AuthorizationModule {}
