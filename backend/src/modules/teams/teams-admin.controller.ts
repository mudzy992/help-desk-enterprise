import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Req, StreamableFile, UnauthorizedException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY, type AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import { permissionKeys } from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { TeamsAdminService } from './teams-admin.service';
import { TeamsConfigurationService } from './teams-configuration.service';

export class UpdateTeamsChannelDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  includeTitle?: boolean;
}

export class TeamsPackageQueryDto {
  @IsOptional()
  @IsIn(['bs', 'en'])
  locale?: 'bs' | 'en';
}

export class TeamsSimulatorQueryDto {
  @IsString()
  @MaxLength(64)
  userId!: string;

  @IsIn(['personal', 'channel'])
  scope!: 'personal' | 'channel';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class TeamsSimulatorActivityDto {
  @IsIn(['install', 'message', 'action'])
  kind!: 'install' | 'message' | 'action';

  @IsString()
  @MaxLength(64)
  userId!: string;

  @IsIn(['personal', 'channel'])
  scope!: 'personal' | 'channel';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  verb?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  replyToId?: string;
}

/**
 * Paket 3.1 (§16): Administration → Teams (`integrations.teams.manage`), plus
 * the caller's own Teams link state for the profile page.
 */
@Controller('integrations/teams')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class TeamsAdminController {
  constructor(
    private readonly service: TeamsAdminService,
  ) {}

  @Get('admin/status')
  @RequirePermissions(permissionKeys.integrationsTeamsManage)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  status() {
    return this.service.status();
  }

  @Post('admin/readiness')
  @HttpCode(200)
  @RequirePermissions(permissionKeys.integrationsTeamsManage)
  readiness() {
    return this.service.readiness();
  }

  @Get('admin/package')
  @RequirePermissions(permissionKeys.integrationsTeamsManage)
  @AdminReadOperation()
  async appPackage(@Query() query: TeamsPackageQueryDto): Promise<StreamableFile> {
    const file = await this.service.appPackage(query.locale ?? 'bs');
    return new StreamableFile(file.content, { type: 'application/zip', disposition: `attachment; filename="${file.fileName}"`, length: file.content.length });
  }

  @Get('admin/channels')
  @RequirePermissions(permissionKeys.integrationsTeamsManage)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  channels() {
    return this.service.channels();
  }

  @Patch('admin/channels/:id')
  @RequirePermissions(permissionKeys.integrationsTeamsManage)
  updateChannel(@Param('id') id: string, @Body() body: UpdateTeamsChannelDto) {
    return this.service.updateChannel(id, body);
  }

  @Delete('admin/channels/:id')
  @RequirePermissions(permissionKeys.integrationsTeamsManage)
  removeChannel(@Param('id') id: string) {
    return this.service.removeChannel(id);
  }

  @Get('admin/simulator/messages')
  @RequirePermissions(permissionKeys.integrationsTeamsManage)
  @AdminReadOperation()
  @Header('Cache-Control', 'no-store')
  async simulatorMessages(@Query() query: TeamsSimulatorQueryDto) {
    return this.service.simulatorMessages(await this.service.simulatorConversationId(query.userId, query.scope), query.limit ?? 50);
  }

  @Post('admin/simulator/activities')
  @HttpCode(200)
  @RequirePermissions(permissionKeys.integrationsTeamsManage)
  sendSimulatorActivity(@Body() body: TeamsSimulatorActivityDto) {
    return this.service.sendSimulatorActivity(body);
  }
}

/** The caller's own Teams link state (any signed-in user; no permission needed). */
@Controller('integrations/teams')
@UseGuards(SessionAuthenticationGuard)
export class TeamsMeController {
  constructor(
    private readonly configuration: TeamsConfigurationService,
    private readonly prisma: PrismaService,
  ) {}

  /** Profile row „Microsoft Teams: povezan / nije instaliran“ (any signed-in user). */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  async me(@Req() request: AuthenticatedHttpRequest) {
    const userId = request[AUTHENTICATED_PRINCIPAL_REQUEST_KEY]?.subjectId;
    if (!userId) throw new UnauthorizedException();
    const config = await this.configuration.load();
    if (config.mode === 'off' || !config.personalEnabled) return { available: false, connected: false };
    const conversation = await this.prisma.teamsConversation.findFirst({ where: { userId, kind: 'PERSONAL', removedAt: null }, select: { id: true } });
    return { available: true, connected: conversation !== null };
  }
}
