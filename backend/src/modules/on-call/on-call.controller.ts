import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { permissionKeys } from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { privacyActorOf } from '../privacy/privacy-actor';
import { runOnCall } from './map-on-call-error';
import {
  CreateOnCallOverrideDto,
  OnCallRangeQueryDto,
  OnCallReasonDto,
  RequestOnCallSwapDto,
  SaveOnCallScheduleDto,
} from './on-call.dto';
import { OnCallService } from './on-call.service';
import { onCallViewerOf, type OnCallViewer } from './on-call-viewer';

/**
 * Paket 2.9 (K3, §4): on-call calendar. Everyone with `oncall.read` sees all
 * schedules and can ask a rotation colleague for a swap; `oncall.manage`
 * edits schedules and overrides.
 */
@Controller('on-call')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class OnCallController {
  constructor(private readonly onCall: OnCallService) {}

  private viewer(request: AuthenticatedHttpRequest): OnCallViewer {
    return onCallViewerOf(request, privacyActorOf(request).principal.subjectId);
  }

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(permissionKeys.onCallRead)
  overview(@Req() request: AuthenticatedHttpRequest) {
    return runOnCall(() => this.onCall.overview(this.viewer(request)));
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(permissionKeys.onCallRead)
  me(@Req() request: AuthenticatedHttpRequest) {
    return runOnCall(() => this.onCall.me(this.viewer(request)));
  }

  @Get('groups/:groupId')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(permissionKeys.onCallRead)
  detail(@Req() request: AuthenticatedHttpRequest, @Param('groupId') groupId: string, @Query() query: OnCallRangeQueryDto) {
    return runOnCall(() => this.onCall.detail(groupId, query, this.viewer(request)));
  }

  @Put('groups/:groupId')
  @RequirePermissions(permissionKeys.onCallManage)
  save(@Req() request: AuthenticatedHttpRequest, @Param('groupId') groupId: string, @Body() body: SaveOnCallScheduleDto) {
    return runOnCall(() =>
      this.onCall.save(groupId, { ...body, ownerUserId: body.ownerUserId ?? null }, this.viewer(request)),
    );
  }

  @Delete('groups/:groupId')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.onCallManage)
  async remove(@Req() request: AuthenticatedHttpRequest, @Param('groupId') groupId: string, @Body() body: OnCallReasonDto) {
    await runOnCall(() => this.onCall.remove(groupId, body.reason, this.viewer(request)));
  }

  @Post('groups/:groupId/overrides')
  @RequirePermissions(permissionKeys.onCallManage)
  createOverride(
    @Req() request: AuthenticatedHttpRequest,
    @Param('groupId') groupId: string,
    @Body() body: CreateOnCallOverrideDto,
  ) {
    return runOnCall(() => this.onCall.createOverride(groupId, body, this.viewer(request)));
  }

  @Delete('overrides/:id')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.onCallManage)
  async deleteOverride(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: OnCallReasonDto) {
    await runOnCall(() => this.onCall.deleteOverride(id, body.reason, this.viewer(request)));
  }

  @Post('groups/:groupId/swaps')
  @RequirePermissions(permissionKeys.onCallRead)
  requestSwap(@Req() request: AuthenticatedHttpRequest, @Param('groupId') groupId: string, @Body() body: RequestOnCallSwapDto) {
    return runOnCall(() => this.onCall.requestSwap(groupId, body, this.viewer(request)));
  }

  @Get('swaps')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(permissionKeys.onCallRead)
  async swaps(@Req() request: AuthenticatedHttpRequest) {
    return { swaps: await runOnCall(() => this.onCall.mySwaps(this.viewer(request))) };
  }

  @Post('swaps/:id/accept')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.onCallRead)
  async accept(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    await runOnCall(() => this.onCall.decideSwap(id, 'accept', this.viewer(request)));
  }

  @Post('swaps/:id/decline')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.onCallRead)
  async decline(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    await runOnCall(() => this.onCall.decideSwap(id, 'decline', this.viewer(request)));
  }

  @Post('swaps/:id/cancel')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.onCallRead)
  async cancel(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    await runOnCall(() => this.onCall.cancelSwap(id, this.viewer(request)));
  }

  @Get('calendar-token')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(permissionKeys.onCallRead)
  tokenStatus(@Req() request: AuthenticatedHttpRequest) {
    return this.onCall.calendarTokenStatus(this.viewer(request));
  }

  @Post('calendar-token')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions(permissionKeys.onCallRead)
  rotateToken(@Req() request: AuthenticatedHttpRequest) {
    return runOnCall(() => this.onCall.rotateCalendarToken(this.viewer(request)));
  }

  @Delete('calendar-token')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.onCallRead)
  async revokeToken(@Req() request: AuthenticatedHttpRequest) {
    await this.onCall.revokeCalendarToken(this.viewer(request));
  }
}

type HeaderResponse = { setHeader(name: string, value: string): void };

/**
 * Paket 2.9 (K3, §4.6): personal iCal feed. The 256-bit token in the URL is
 * the only credential (calendar clients cannot log in); only its SHA-256 is
 * stored, and rotating it on the account page invalidates the old URL.
 */
@Controller('public/on-call')
export class PublicOnCallCalendarController {
  constructor(private readonly onCall: OnCallService) {}

  @Get('calendar.ics')
  async calendar(@Query('token') token: unknown, @Res({ passthrough: true }) response: HeaderResponse): Promise<string> {
    const body = typeof token === 'string' ? await this.onCall.icalFeed(token) : null;
    response.setHeader('Cache-Control', 'private, no-store');
    if (body === null) throw new NotFoundException({ code: 'ON_CALL_CALENDAR_NOT_FOUND', message: 'Not found' });
    response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    response.setHeader('Content-Disposition', 'inline; filename="on-call.ics"');
    return body;
  }
}
