import {
  Body,
  Controller,
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
import { RequireServiceScope } from '../authorization/require-service-scope.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { readCatalogMutationContext } from '../service-catalog/read-catalog-mutation-context';
import {
  SaveOnboardingApprovalsStepDto,
  SaveOnboardingRoutingStepDto,
  SaveOnboardingSlaStepDto,
} from './dto/save-onboarding-step.dto';
import { ServiceOnboardingStepsService } from './service-onboarding-steps.service';
import type { ServiceOnboardingResponse } from './service-onboarding.types';

@Controller('services')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ServiceOnboardingDomainStepsController {
  constructor(private readonly stepsService: ServiceOnboardingStepsService) {}

  @Patch(':serviceId/onboarding/routing')
  @RequirePermissions(permissionKeys.routingWrite)
  @RequireServiceScope({ field: 'serviceId' })
  saveRouting(
    @Param('serviceId') serviceId: string,
    @Body() body: SaveOnboardingRoutingStepDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.saveRoutingStep(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Post(':serviceId/onboarding/steps/routing/complete')
  @RequirePermissions(permissionKeys.routingWrite)
  @RequireServiceScope({ field: 'serviceId' })
  completeRouting(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.completeRoutingStep(
      serviceId,
      readCatalogMutationContext(request),
    );
  }

  @Patch(':serviceId/onboarding/sla')
  @RequirePermissions(permissionKeys.slaWrite)
  @RequireServiceScope({ field: 'serviceId' })
  saveSla(
    @Param('serviceId') serviceId: string,
    @Body() body: SaveOnboardingSlaStepDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.saveSlaStep(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Post(':serviceId/onboarding/steps/sla/complete')
  @RequirePermissions(permissionKeys.slaWrite)
  @RequireServiceScope({ field: 'serviceId' })
  completeSla(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.completeSlaStep(
      serviceId,
      readCatalogMutationContext(request),
    );
  }

  @Patch(':serviceId/onboarding/approvals')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  saveApprovals(
    @Param('serviceId') serviceId: string,
    @Body() body: SaveOnboardingApprovalsStepDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.saveApprovalsStep(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Post(':serviceId/onboarding/steps/approvals/complete')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  completeApprovals(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.completeApprovalsStep(
      serviceId,
      readCatalogMutationContext(request),
    );
  }
}
