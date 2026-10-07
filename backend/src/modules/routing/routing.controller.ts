import { AdminConfigDomains } from '../../common/admin-realtime/admin-config-domain.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
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
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequireOrganizationalUnitScope } from '../authorization/require-organizational-unit-scope.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RequireServiceScope } from '../authorization/require-service-scope.decorator';
import { RoleGuard } from '../authorization/role.guard';
import {
  CreateRoutingRuleDto,
  DeleteRoutingRuleDto,
  ListRoutingCoverageQueryDto,
  ListRoutingRulesQueryDto,
  ResolveRoutingQueryDto,
  UpdateRoutingRuleDto,
} from './dto/routing.dto';
import type { RoutingRuleDeleteImpact } from './delete-routing-rule';
import { RoutingService } from './routing.service';
import type {
  RoutingChangeLogResponse,
  RoutingCoveragePage,
  RoutingHandlerGroupResponse,
  RoutingResolution,
  RoutingRuleResponse,
} from './routing.types';

@AdminConfigDomains('routing')
@Controller('routing')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Post('rules')
  @RequirePermissions(permissionKeys.routingWrite)
  @RequireOrganizationalUnitScope({ field: 'originUnitId' })
  @RequireServiceScope({ field: 'serviceId' })
  createRule(
    @Body() body: CreateRoutingRuleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<RoutingRuleResponse> {
    return this.routingService.createRule(body, {
      actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
    });
  }

  @Patch('rules/:ruleId')
  @RequirePermissions(permissionKeys.routingWrite)
  @RequireOrganizationalUnitScope({ field: 'originUnitId' })
  @RequireServiceScope({ field: 'serviceId' })
  updateRule(
    @Param('ruleId') ruleId: string,
    @Body() body: UpdateRoutingRuleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<RoutingRuleResponse> {
    return this.routingService.updateRule(ruleId, body, {
      actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
    });
  }

  @Delete('rules/:ruleId')
  @RequirePermissions(permissionKeys.routingWrite)
  @RequireOrganizationalUnitScope({ field: 'originUnitId' })
  @RequireServiceScope({ field: 'serviceId' })
  deleteRule(
    @Param('ruleId') ruleId: string,
    @Body() body: DeleteRoutingRuleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<RoutingRuleDeleteImpact> {
    return this.routingService.deleteRule(ruleId, body, {
      actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
    });
  }

  @Get('rules/:ruleId/delete-impact')
  @RequirePermissions(permissionKeys.routingRead)
  async deleteImpact(
    @Param('ruleId') ruleId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<RoutingRuleDeleteImpact> {
    const viewer = await this.routingService.loadViewerContext(
      readAuthenticatedPrincipal(request)?.subjectId ?? null,
    );
    return this.routingService.deleteImpact(ruleId, viewer);
  }

  @Get('rules/:ruleId/changes')
  @RequirePermissions(permissionKeys.routingRead)
  async listRuleChanges(
    @Param('ruleId') ruleId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly RoutingChangeLogResponse[]> {
    const viewer = await this.routingService.loadViewerContext(
      readAuthenticatedPrincipal(request)?.subjectId ?? null,
    );
    return this.routingService.listRuleChanges(ruleId, viewer);
  }

  @Get('changes')
  @RequirePermissions(permissionKeys.routingRead)
  async listChanges(
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly RoutingChangeLogResponse[]> {
    const viewer = await this.routingService.loadViewerContext(
      readAuthenticatedPrincipal(request)?.subjectId ?? null,
    );
    return this.routingService.listChanges(viewer);
  }

  @Get('groups')
  @RequirePermissions(permissionKeys.routingRead)
  async listGroups(
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly RoutingHandlerGroupResponse[]> {
    const viewer = await this.routingService.loadViewerContext(
      readAuthenticatedPrincipal(request)?.subjectId ?? null,
    );
    return this.routingService.listHandlerGroups(viewer);
  }

  @Get('rules')
  @RequirePermissions(permissionKeys.routingRead)
  async listRules(
    @Query() query: ListRoutingRulesQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly RoutingRuleResponse[]> {
    const viewer = await this.routingService.loadViewerContext(
      readAuthenticatedPrincipal(request)?.subjectId ?? null,
    );
    return this.routingService.listRules(query, viewer);
  }

  @Get('resolve')
  @RequirePermissions(permissionKeys.routingRead)
  @RequireOrganizationalUnitScope({ field: 'originUnitId' })
  @RequireServiceScope({ field: 'serviceId' })
  resolve(@Query() query: ResolveRoutingQueryDto): Promise<RoutingResolution> {
    return this.routingService.resolve(query);
  }

  @Get('coverage')
  @RequirePermissions(permissionKeys.routingRead)
  async coverage(
    @Query() query: ListRoutingCoverageQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<RoutingCoveragePage> {
    const viewer = await this.routingService.loadViewerContext(
      readAuthenticatedPrincipal(request)?.subjectId ?? null,
    );
    return this.routingService.coverage(query, viewer);
  }
}
