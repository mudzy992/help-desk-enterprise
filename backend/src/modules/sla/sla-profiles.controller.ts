import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { ChangeReasonDto } from './dto/change-reason.dto';
import { CreateSlaProfileDto, UpdateSlaProfileDto } from './dto/profile.dto';
import { readSlaMutationContext } from './read-sla-mutation-context';
import { SlaProfilesService } from './sla-profiles.service';
import type { SlaChangeLogResponse, SlaProfileResponse } from './sla.types';

@Controller('sla/profiles')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
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
  list(): Promise<readonly SlaProfileResponse[]> {
    return this.slaProfilesService.list();
  }

  @Get(':profileId/changes')
  listChanges(
    @Param('profileId') profileId: string,
  ): Promise<readonly SlaChangeLogResponse[]> {
    return this.slaProfilesService.listChanges(profileId);
  }

  @Get(':profileId')
  get(@Param('profileId') profileId: string): Promise<SlaProfileResponse> {
    return this.slaProfilesService.get(profileId);
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
