import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { InboundEmailAdminService, type InboundEmailStatusResponse } from './inbound-email-admin.service';

/** Paket 2.3 (R13): "Inbound e-mail" admin page. Never returns message bodies. */
@Controller('admin/inbound-email')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
export class InboundEmailAdminController {
  constructor(private readonly service: InboundEmailAdminService) {}

  @Get('status')
  @AdminReadOperation()
  getStatus(): Promise<InboundEmailStatusResponse> {
    return this.service.getStatus();
  }

  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  @AdminReadOperation()
  testConnection() {
    return this.service.testConnection();
  }
}
