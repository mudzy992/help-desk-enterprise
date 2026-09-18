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
  RoutingCoverageItem,
  RoutingHandlerGroupResponse,
  RoutingResolution,
  RoutingRuleResponse,
} from './routing.types';

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
  deleteImpact(
    @Param('ruleId') ruleId: string,
  ): Promise<RoutingRuleDeleteImpact> {
    return this.routingService.deleteImpact(ruleId);
  }

  @Get('rules/:ruleId/changes')
  listRuleChanges(
    @Param('ruleId') ruleId: string,
  ): Promise<readonly RoutingChangeLogResponse[]> {
    return this.routingService.listRuleChanges(ruleId);
  }

  @Get('changes')
  listChanges(): Promise<readonly RoutingChangeLogResponse[]> {
    return this.routingService.listChanges();
  }

  @Get('groups')
  listGroups(): Promise<readonly RoutingHandlerGroupResponse[]> {
    return this.routingService.listHandlerGroups();
  }

  @Get('rules')
  listRules(
    @Query() query: ListRoutingRulesQueryDto,
  ): Promise<readonly RoutingRuleResponse[]> {
    return this.routingService.listRules(query);
  }

  @Get('resolve')
  @RequireOrganizationalUnitScope({ field: 'originUnitId' })
  @RequireServiceScope({ field: 'serviceId' })
  resolve(@Query() query: ResolveRoutingQueryDto): Promise<RoutingResolution> {
    return this.routingService.resolve(query);
  }

  @Get('coverage')
  coverage(
    @Query() query: ListRoutingCoverageQueryDto,
  ): Promise<readonly RoutingCoverageItem[]> {
    return this.routingService.coverage(query);
  }
}
