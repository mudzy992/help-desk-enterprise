import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import { permissionKeys } from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { privacyActorOf } from '../privacy/privacy-actor';
import { OpsAlertHistoryQueryDto, SilenceOpsAlertsDto } from './ops-health.dto';
import { OpsHealthService } from './ops-health.service';

/**
 * Paket 2.7 (§6, §9): "System health". Reading needs `ops.health.view`
 * (ADMIN, SUPER_ADMIN); acknowledging an alarm too (it only stops
 * reminders). Silencing, the test message and the DLQ baseline change how
 * everyone is alerted and need `ops.alerts.manage` (SUPER_ADMIN).
 */
@Controller('ops')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class OpsHealthController {
  constructor(private readonly service: OpsHealthService) {}

  @Get('health')
  @RequirePermissions(permissionKeys.opsHealthView)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  overview() {
    return this.service.overview();
  }

  @Get('alerts')
  @RequirePermissions(permissionKeys.opsHealthView)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  history(@Query() query: OpsAlertHistoryQueryDto) {
    return this.service.history(query.status ?? 'resolved', query.limit ?? 100);
  }

  @Post('alerts/:id/acknowledge')
  @HttpCode(200)
  @RequirePermissions(permissionKeys.opsHealthView)
  acknowledge(@Param('id') id: string, @Req() request: AuthenticatedHttpRequest) {
    return this.service.acknowledge(id, privacyActorOf(request));
  }

  @Post('alerts/silence')
  @HttpCode(200)
  @RequirePermissions(permissionKeys.opsAlertsManage)
  silence(@Body() body: SilenceOpsAlertsDto, @Req() request: AuthenticatedHttpRequest) {
    return this.service.silence(body.minutes, body.reason, privacyActorOf(request));
  }

  @Delete('alerts/silence')
  @RequirePermissions(permissionKeys.opsAlertsManage)
  unsilence(@Req() request: AuthenticatedHttpRequest) {
    return this.service.unsilence(privacyActorOf(request));
  }

  @Post('alerts/test')
  @HttpCode(200)
  @RequirePermissions(permissionKeys.opsAlertsManage)
  sendTest(@Req() request: AuthenticatedHttpRequest) {
    return this.service.sendTest(privacyActorOf(request));
  }

  @Post('dlq/acknowledge')
  @HttpCode(200)
  @RequirePermissions(permissionKeys.opsAlertsManage)
  acknowledgeDlq(@Req() request: AuthenticatedHttpRequest) {
    return this.service.acknowledgeDlq(privacyActorOf(request));
  }
}
