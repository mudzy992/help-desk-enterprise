import {
  Body,
  Controller,
  Get,
  Param,
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
import { CreateServiceDto } from '../service-catalog/dto/create-service.dto';
import { readCatalogMutationContext } from '../service-catalog/read-catalog-mutation-context';
import { ServiceOnboardingService } from './service-onboarding.service';
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
export class ServiceOnboardingController {
  constructor(private readonly onboardingService: ServiceOnboardingService) {}

  @Post('onboarding')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  create(
    @Body() body: CreateServiceDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.onboardingService.create(body, readCatalogMutationContext(request));
  }

  @Post(':serviceId/onboarding')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  start(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.onboardingService.start(
      serviceId,
      readCatalogMutationContext(request),
    );
  }

  @Get(':serviceId/onboarding')
  @RequireServiceScope({ field: 'serviceId' })
  getByServiceId(
    @Param('serviceId') serviceId: string,
  ): Promise<ServiceOnboardingResponse> {
    return this.onboardingService.getByServiceId(serviceId);
  }

  @Post(':serviceId/onboarding/finalize')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  finalize(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.onboardingService.finalize(
      serviceId,
      readCatalogMutationContext(request),
    );
  }

  @Post(':serviceId/onboarding/abandon')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  abandon(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.onboardingService.abandon(
      serviceId,
      readCatalogMutationContext(request),
    );
  }

  @Post(':serviceId/onboarding/resume')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  resume(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceOnboardingResponse> {
    return this.onboardingService.resume(
      serviceId,
      readCatalogMutationContext(request),
    );
  }
}
