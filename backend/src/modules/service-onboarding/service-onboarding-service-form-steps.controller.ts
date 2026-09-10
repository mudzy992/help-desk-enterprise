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
import { UpdateServiceDto } from '../service-catalog/dto/update-service.dto';
import { readCatalogMutationContext } from '../service-catalog/read-catalog-mutation-context';
import { SaveOnboardingFormStepDto } from './dto/save-onboarding-step.dto';
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
export class ServiceOnboardingServiceFormStepsController {
  constructor(private readonly stepsService: ServiceOnboardingStepsService) {}

  @Patch(':serviceId/onboarding/service')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  saveService(
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateServiceDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.saveServiceStep(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Post(':serviceId/onboarding/steps/service/complete')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  completeService(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.completeServiceStep(
      serviceId,
      readCatalogMutationContext(request),
    );
  }

  @Patch(':serviceId/onboarding/form')
  @RequirePermissions(permissionKeys.serviceFormsWrite)
  @RequireServiceScope({ field: 'serviceId' })
  saveForm(
    @Param('serviceId') serviceId: string,
    @Body() body: SaveOnboardingFormStepDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.saveFormStep(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Post(':serviceId/onboarding/steps/form/complete')
  @RequirePermissions(permissionKeys.serviceFormsWrite)
  @RequireServiceScope({ field: 'serviceId' })
  completeForm(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.stepsService.completeFormStep(
      serviceId,
      readCatalogMutationContext(request),
    );
  }
}
