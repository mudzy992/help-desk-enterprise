import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
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
  ListRoutingCoverageQueryDto,
  ListRoutingRulesQueryDto,
  ResolveRoutingQueryDto,
} from './dto/routing.dto';
import { RoutingService } from './routing.service';
import type {
  RoutingCoverageItem,
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
  createRule(@Body() body: CreateRoutingRuleDto): Promise<RoutingRuleResponse> {
    return this.routingService.createRule(body);
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
