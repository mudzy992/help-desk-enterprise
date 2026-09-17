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
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { ChangeReasonDto } from './dto/change-reason.dto';
import {
  CreateSlaEscalationRuleDto,
  ListSlaEscalationRulesQueryDto,
  UpdateSlaEscalationRuleDto,
} from './dto/escalation-rule.dto';
import { readSlaMutationContext } from './read-sla-mutation-context';
import { SlaEscalationRulesService } from './sla-escalation-rules.service';
import type {
  SlaChangeLogResponse,
  SlaEscalationRuleResponse,
} from './sla.types';

@Controller('sla/escalation-rules')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
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
  ): Promise<readonly SlaEscalationRuleResponse[]> {
    return this.slaEscalationRulesService.list(query.slaProfileId);
  }

  @Get(':ruleId/changes')
  listChanges(
    @Param('ruleId') ruleId: string,
  ): Promise<readonly SlaChangeLogResponse[]> {
    return this.slaEscalationRulesService.listChanges(ruleId);
  }

  @Get(':ruleId')
  get(@Param('ruleId') ruleId: string): Promise<SlaEscalationRuleResponse> {
    return this.slaEscalationRulesService.get(ruleId);
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
