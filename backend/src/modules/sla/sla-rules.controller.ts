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
  CreateSlaRuleDto,
  ListSlaRulesQueryDto,
  ResolveSlaTargetsQueryDto,
  UpdateSlaRuleDto,
} from './dto/rule.dto';
import { readSlaMutationContext } from './read-sla-mutation-context';
import { SlaRulesService } from './sla-rules.service';
import type {
  SlaChangeLogResponse,
  SlaRuleResponse,
  SlaTargetsResponse,
} from './sla.types';

@Controller('sla/rules')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SlaRulesController {
  constructor(private readonly slaRulesService: SlaRulesService) {}

  @Post()
  @RequirePermissions(permissionKeys.slaWrite)
  create(
    @Body() body: CreateSlaRuleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaRuleResponse> {
    return this.slaRulesService.create(body, readSlaMutationContext(request));
  }

  @Get()
  list(@Query() query: ListSlaRulesQueryDto): Promise<readonly SlaRuleResponse[]> {
    return this.slaRulesService.list(query.slaProfileId);
  }

  @Get('resolve')
  resolve(
    @Query() query: ResolveSlaTargetsQueryDto,
  ): Promise<SlaTargetsResponse> {
    return this.slaRulesService.resolveTargets(query);
  }

  @Get(':ruleId/changes')
  listChanges(
    @Param('ruleId') ruleId: string,
  ): Promise<readonly SlaChangeLogResponse[]> {
    return this.slaRulesService.listChanges(ruleId);
  }

  @Get(':ruleId')
  get(@Param('ruleId') ruleId: string): Promise<SlaRuleResponse> {
    return this.slaRulesService.get(ruleId);
  }

  @Patch(':ruleId')
  @RequirePermissions(permissionKeys.slaWrite)
  update(
    @Param('ruleId') ruleId: string,
    @Body() body: UpdateSlaRuleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaRuleResponse> {
    return this.slaRulesService.update(
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
    await this.slaRulesService.delete(
      ruleId,
      body.reason,
      readSlaMutationContext(request),
    );
  }
}
