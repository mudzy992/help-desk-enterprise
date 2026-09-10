import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PolicyPacksController } from './policy-packs.controller';
import { PolicyPacksService } from './policy-packs.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule],
  controllers: [PolicyPacksController],
  providers: [PolicyPacksService],
  exports: [PolicyPacksService],
})
export class PolicyPacksModule {}
