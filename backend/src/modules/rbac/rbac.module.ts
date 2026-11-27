import { Module } from '@nestjs/common';
import { CacheInvalidationModule } from '../../common/cache-invalidation/cache-invalidation.module';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RoleHoldersInvalidationDispatcher } from './role-holders-invalidation.dispatcher';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  // `AuthenticationModule` exports `PrincipalContextInvalidator` and
  // `CacheInvalidationModule` (global, owns the outbox) provides the durable
  // retry the role write schedules (W2.32, `BA-rbac-05`).
  imports: [AuthenticationModule, AuthorizationModule, CacheInvalidationModule],
  controllers: [RolesController],
  providers: [RolesService, RoleHoldersInvalidationDispatcher],
  exports: [RolesService],
})
export class RbacModule {}
