import { Module } from '@nestjs/common';
import { OrganizationalUnitsController } from './organizational-units.controller';
import { OrganizationalUnitsService } from './organizational-units.service';

@Module({
  controllers: [OrganizationalUnitsController],
  providers: [OrganizationalUnitsService],
})
export class OrganizationalUnitsModule {}
