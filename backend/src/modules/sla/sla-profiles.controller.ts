import { AdminConfigDomains } from '../../common/admin-realtime/admin-config-domain.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import {
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { SlaGlobalAdministrationGuard } from './sla-global-administration.guard';
import { ChangeReasonDto } from './dto/change-reason.dto';
import { CreateSlaProfileDto, UpdateSlaProfileDto } from './dto/profile.dto';
import { readSlaMutationContext } from './read-sla-mutation-context';
import { readSlaReadScope } from './sla-read-scope';
import { SlaListQueryDto } from './dto/sla-list-query.dto';
import { SlaProfilesService } from './sla-profiles.service';
import type { SlaChangeLogResponse, SlaPage, SlaProfileResponse } from './sla.types';

@AdminConfigDomains('sla')
@Controller('sla/profiles')
@UseGuards(SessionAuthenticationGuard, RoleGuard, SlaGlobalAdministrationGuard)
@RequirePermissions(permissionKeys.slaRead)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SlaProfilesController {
  constructor(private readonly slaProfilesService: SlaProfilesService) {}

  @Post()
  @RequirePermissions(permissionKeys.slaWrite)
  create(
    @Body() body: CreateSlaProfileDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaProfileResponse> {
    return this.slaProfilesService.create(body, readSlaMutationContext(request));
  }

  @Get()
  list(@Query() query: SlaListQueryDto, @Req() request: AuthenticatedHttpRequest): Promise<SlaPage<SlaProfileResponse>> {
    return this.slaProfilesService.list({ ...query, scope: readSlaReadScope(request) });
  }

  @Get(':profileId/changes')
  listChanges(
    @Param('profileId') profileId: string,
    @Query() query: SlaListQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaPage<SlaChangeLogResponse>> {
    return this.slaProfilesService.listChanges(profileId, { ...query, scope: readSlaReadScope(request) });
  }

  @Get(':profileId')
  get(@Param('profileId') profileId: string, @Req() request: AuthenticatedHttpRequest): Promise<SlaProfileResponse> {
    return this.slaProfilesService.get(profileId, readSlaReadScope(request));
  }

  @Patch(':profileId')
  @RequirePermissions(permissionKeys.slaWrite)
  update(
    @Param('profileId') profileId: string,
    @Body() body: UpdateSlaProfileDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaProfileResponse> {
    return this.slaProfilesService.update(
      profileId,
      body,
      readSlaMutationContext(request),
    );
  }

  @Delete(':profileId')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.slaWrite)
  async delete(
    @Param('profileId') profileId: string,
    @Body() body: ChangeReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.slaProfilesService.delete(
      profileId,
      body.reason,
      readSlaMutationContext(request),
    );
  }
}
