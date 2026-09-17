import {
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { SlaComplianceQueryDto } from './dto/sla-compliance-query.dto';
import { SlaComplianceService } from './sla-compliance.service';
import type { SlaComplianceResponse } from './sla-compliance.types';

@Controller('sla/compliance')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SlaComplianceController {
  constructor(private readonly slaComplianceService: SlaComplianceService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getCompliance(
    @Query() query: SlaComplianceQueryDto,
  ): Promise<SlaComplianceResponse> {
    return this.slaComplianceService.getCompliance({ days: query.days });
  }
}
