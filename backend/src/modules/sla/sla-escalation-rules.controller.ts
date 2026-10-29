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
import {
  CreateSlaEscalationRuleDto,
  ListSlaEscalationRulesQueryDto,
  UpdateSlaEscalationRuleDto,
} from './dto/escalation-rule.dto';
import { readSlaMutationContext } from './read-sla-mutation-context';
import { readSlaReadScope } from './sla-read-scope';
import { SlaListQueryDto } from './dto/sla-list-query.dto';
import { SlaEscalationRulesService } from './sla-escalation-rules.service';
import type {
  SlaChangeLogResponse,
  SlaPage,
  SlaEscalationRuleResponse,
} from './sla.types';

@AdminConfigDomains('sla')
@Controller('sla/escalation-rules')
@UseGuards(SessionAuthenticationGuard, RoleGuard, SlaGlobalAdministrationGuard)
@RequirePermissions(permissionKeys.slaRead)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SlaEscalationRulesController {
  constructor(
    private readonly slaEscalationRulesService: SlaEscalationRulesService,
  ) {}

  @Post()
  @RequirePermissions(permissionKeys.slaWrite)
  create(
    @Body() body: CreateSlaEscalationRuleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaEscalationRuleResponse> {
    return this.slaEscalationRulesService.create(
      body,
      readSlaMutationContext(request),
    );
  }

  @Get()
  list(
    @Query() query: ListSlaEscalationRulesQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaPage<SlaEscalationRuleResponse>> {
    return this.slaEscalationRulesService.list(query.slaProfileId, { ...query, scope: readSlaReadScope(request) });
  }

  @Get(':ruleId/changes')
  listChanges(
    @Param('ruleId') ruleId: string,
    @Query() query: SlaListQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaPage<SlaChangeLogResponse>> {
    return this.slaEscalationRulesService.listChanges(ruleId, { ...query, scope: readSlaReadScope(request) });
  }

  @Get(':ruleId')
  get(@Param('ruleId') ruleId: string, @Req() request: AuthenticatedHttpRequest): Promise<SlaEscalationRuleResponse> {
    return this.slaEscalationRulesService.get(ruleId, readSlaReadScope(request));
  }

  @Patch(':ruleId')
  @RequirePermissions(permissionKeys.slaWrite)
  update(
    @Param('ruleId') ruleId: string,
    @Body() body: UpdateSlaEscalationRuleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaEscalationRuleResponse> {
    return this.slaEscalationRulesService.update(
      ruleId,
      body,
      readSlaMutationContext(request),
    );
  }

  @Delete(':ruleId')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.slaWrite)
  async delete(
    @Param('ruleId') ruleId: string,
    @Body() body: ChangeReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.slaEscalationRulesService.delete(
      ruleId,
      body.reason,
      readSlaMutationContext(request),
    );
  }
}
