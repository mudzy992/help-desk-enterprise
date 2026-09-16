import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { OrganizationalUnitsController } from './organizational-units.controller';
import { OrganizationalUnitsService } from './organizational-units.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule],
  controllers: [OrganizationalUnitsController],
  providers: [OrganizationalUnitsService],
})
export class OrganizationalUnitsModule {}
