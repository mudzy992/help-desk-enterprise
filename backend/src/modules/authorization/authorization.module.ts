import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationContextLoader } from './authorization-context.loader';
import { AuthorizationService } from './authorization.service';
import { OuAccessGuard } from './ou-access.guard';
import { RoleGuard } from './role.guard';
import { ShadowAuthorizationService } from './shadow-authorization.service';

@Module({
  imports: [AuthenticationModule],
  providers: [
    AuthorizationContextLoader,
    AuthorizationService,
    ShadowAuthorizationService,
    RoleGuard,
    OuAccessGuard,
  ],
  exports: [
    AuthorizationService,
    ShadowAuthorizationService,
    RoleGuard,
    OuAccessGuard,
  ],
})
export class AuthorizationModule {}
