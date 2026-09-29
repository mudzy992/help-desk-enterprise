import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
/** Only what the CSV download needs from the platform response. */
type HeaderResponse = { setHeader(name: string, value: string): void };
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { privacyActorOf } from '../privacy/privacy-actor';
import { announcementViewerOf, type AnnouncementViewer } from './announcement-viewer';
import { AnnouncementAudienceDto, AnnouncementReasonDto, SaveAnnouncementDto } from './announcements.dto';
import { AnnouncementsService } from './announcements.service';
import { runAnnouncement } from './map-announcement-error';

/**
 * Paket 2.9 (K2, §3): announcements. Every signed-in user reads the active
 * ones meant for them; management and the report are checked in the service
 * (announcement.manage, announcement.report.read, or an agent limited to the
 * own unit when private.announcements.agentsMayPublish is on).
 */
@Controller('announcements')
// RoleGuard denies routes without a permission requirement; every check here is in the service.
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  private viewer(request: AuthenticatedHttpRequest): AnnouncementViewer {
    return announcementViewerOf(request, privacyActorOf(request).principal.subjectId);
  }

  @Get('active')
  @Header('Cache-Control', 'no-store')
  active(@Req() request: AuthenticatedHttpRequest) {
    return runAnnouncement(() => this.announcements.active(this.viewer(request)));
  }

  @Get('archive')
  @Header('Cache-Control', 'no-store')
  archive(@Req() request: AuthenticatedHttpRequest) {
    return runAnnouncement(() => this.announcements.archive(this.viewer(request)));
  }

  @Post(':id/acknowledge')
  @HttpCode(204)
  async acknowledge(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    await runAnnouncement(() => this.announcements.acknowledge(id, this.viewer(request)));
  }

  @Post(':id/dismiss')
  @HttpCode(204)
  async dismiss(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    await runAnnouncement(() => this.announcements.dismiss(id, this.viewer(request)));
  }

  // ------------------------------------------------------------ management

  @Get('manage/capabilities')
  @Header('Cache-Control', 'no-store')
  async capabilities(@Req() request: AuthenticatedHttpRequest) {
    const enabled = await this.announcements.isEnabled();
    const capabilities = await this.announcements.capabilities(this.viewer(request));
    return { enabled, ...capabilities };
  }

  @Get('manage/options')
  @Header('Cache-Control', 'no-store')
  options(@Req() request: AuthenticatedHttpRequest) {
    return runAnnouncement(() => this.announcements.options(this.viewer(request)));
  }

  @Post('manage/audience-preview')
  @HttpCode(200)
  previewAudience(@Req() request: AuthenticatedHttpRequest, @Body() body: AnnouncementAudienceDto) {
    return runAnnouncement(() => this.announcements.previewAudience(body, this.viewer(request)));
  }

  @Get('manage')
  @Header('Cache-Control', 'no-store')
  list(@Req() request: AuthenticatedHttpRequest) {
    return runAnnouncement(() => this.announcements.list(this.viewer(request)));
  }

  @Post('manage')
  create(@Req() request: AuthenticatedHttpRequest, @Body() body: SaveAnnouncementDto) {
    return runAnnouncement(() => this.announcements.create(body, this.viewer(request)));
  }

  @Get('manage/:id')
  @Header('Cache-Control', 'no-store')
  detail(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAnnouncement(() => this.announcements.detail(id, this.viewer(request)));
  }

  @Put('manage/:id')
  update(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: SaveAnnouncementDto) {
    return runAnnouncement(() => this.announcements.update(id, body, this.viewer(request)));
  }

  @Delete('manage/:id')
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    await runAnnouncement(() => this.announcements.remove(id, this.viewer(request)));
  }

  @Post('manage/:id/publish')
  @HttpCode(200)
  publish(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAnnouncement(() => this.announcements.publish(id, this.viewer(request)));
  }

  @Post('manage/:id/withdraw')
  @HttpCode(200)
  withdraw(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: AnnouncementReasonDto) {
    return runAnnouncement(() => this.announcements.withdraw(id, body.reason, this.viewer(request)));
  }

  @Get('manage/:id/report')
  @Header('Cache-Control', 'no-store')
  report(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAnnouncement(() => this.announcements.report(id, this.viewer(request)));
  }

  @Get('manage/:id/report.csv')
  async reportCsv(
    @Req() request: AuthenticatedHttpRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<string> {
    const file = await runAnnouncement(() => this.announcements.reportCsv(id, this.viewer(request)));
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    return file.content;
  }

  @Post('manage/:id/remind')
  @HttpCode(200)
  remind(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return runAnnouncement(() => this.announcements.remind(id, this.viewer(request)));
  }
}
