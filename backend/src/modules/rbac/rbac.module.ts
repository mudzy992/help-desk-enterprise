import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RbacModule {}
