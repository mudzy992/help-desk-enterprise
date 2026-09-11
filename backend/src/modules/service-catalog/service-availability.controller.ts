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
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RequireServiceScope } from '../authorization/require-service-scope.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { catalogTicketCreateReadRoles } from './catalog-ticket-create-read-roles';
import { CreateServiceDowntimeWindowDto } from './dto/create-service-downtime-window.dto';
import { DeleteServiceDowntimeWindowQueryDto } from './dto/delete-service-downtime-window-query.dto';
import { UpdateServiceAvailabilityDto } from './dto/update-service-availability.dto';
import { UpdateServiceDowntimeWindowDto } from './dto/update-service-downtime-window.dto';
import { readCatalogMutationContext } from './read-catalog-mutation-context';
import { ServiceAvailabilityService } from './service-availability.service';
import type {
  DowntimeWindowResponse,
  ServiceTicketCreationEligibility,
} from './service-availability.types';
import type { ServiceResponse } from './service-catalog.types';

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
export class ServiceAvailabilityController {
  constructor(
    private readonly serviceAvailabilityService: ServiceAvailabilityService,
  ) {}

  @Patch(':serviceId/availability')
  @RequirePermissions(permissionKeys.serviceAvailabilityWrite)
  @RequireServiceScope({ field: 'serviceId' })
  updateAvailability(
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateServiceAvailabilityDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceResponse> {
    return this.serviceAvailabilityService.updateAvailability(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Get(':serviceId/downtime-windows')
  @RequireServiceScope({ field: 'serviceId' })
  listDowntimeWindows(
    @Param('serviceId') serviceId: string,
  ): Promise<readonly DowntimeWindowResponse[]> {
    return this.serviceAvailabilityService.listDowntimeWindows(serviceId);
  }

  @Post(':serviceId/downtime-windows')
  @RequirePermissions(permissionKeys.serviceAvailabilityWrite)
  @RequireServiceScope({ field: 'serviceId' })
  createDowntimeWindow(
    @Param('serviceId') serviceId: string,
    @Body() body: CreateServiceDowntimeWindowDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceResponse> {
    return this.serviceAvailabilityService.createDowntimeWindow(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Patch(':serviceId/downtime-windows/:downtimeWindowId')
  @RequirePermissions(permissionKeys.serviceAvailabilityWrite)
  @RequireServiceScope({ field: 'serviceId' })
  updateDowntimeWindow(
    @Param('serviceId') serviceId: string,
    @Param('downtimeWindowId') downtimeWindowId: string,
    @Body() body: UpdateServiceDowntimeWindowDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceResponse> {
    return this.serviceAvailabilityService.updateDowntimeWindow(
      serviceId,
      downtimeWindowId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Delete(':serviceId/downtime-windows/:downtimeWindowId')
  @RequirePermissions(permissionKeys.serviceAvailabilityWrite)
  @RequireServiceScope({ field: 'serviceId' })
  deleteDowntimeWindow(
    @Param('serviceId') serviceId: string,
    @Param('downtimeWindowId') downtimeWindowId: string,
    @Query() query: DeleteServiceDowntimeWindowQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceResponse> {
    return this.serviceAvailabilityService.deleteDowntimeWindow(
      serviceId,
      downtimeWindowId,
      readCatalogMutationContext(request),
      new Date(),
      query.reason,
    );
  }

  @Get(':serviceId/ticket-creation-eligibility')
  @RequireRoles(...catalogTicketCreateReadRoles)
  @RequireServiceScope({ field: 'serviceId' })
  evaluateTicketCreationEligibility(
    @Param('serviceId') serviceId: string,
  ): Promise<ServiceTicketCreationEligibility> {
    return this.serviceAvailabilityService.evaluateTicketCreationEligibility(
      serviceId,
    );
  }
}
