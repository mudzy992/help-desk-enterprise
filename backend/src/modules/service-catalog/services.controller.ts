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
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RequireServiceScope } from '../authorization/require-service-scope.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { catalogTicketCreateReadRoles } from './catalog-ticket-create-read-roles';
import { CreateServiceDto } from './dto/create-service.dto';
import { ListServicesQueryDto } from './dto/list-services-query.dto';
import { TransitionServiceLifecycleDto } from './dto/transition-service-lifecycle.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { readCatalogMutationContext } from './read-catalog-mutation-context';
import { ServiceCatalogService } from './service-catalog.service';
import type { ServiceResponse } from './service-catalog.types';

@AdminConfigDomains('catalog')
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
export class ServicesController {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Post()
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  create(
    @Body() body: CreateServiceDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceResponse> {
    return this.serviceCatalogService.create(body, readCatalogMutationContext(request));
  }

  @Get()
  @RequireRoles(...catalogTicketCreateReadRoles)
  list(@Query() query: ListServicesQueryDto): Promise<readonly ServiceResponse[]> {
    return this.serviceCatalogService.list(query);
  }

  @Get(':serviceId')
  @RequireRoles(...catalogTicketCreateReadRoles)
  @RequireServiceScope({ field: 'serviceId' })
  getById(@Param('serviceId') serviceId: string): Promise<ServiceResponse> {
    return this.serviceCatalogService.getById(serviceId);
  }

  @Patch(':serviceId')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  update(
    @Param('serviceId') serviceId: string,
    @Body() body: UpdateServiceDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceResponse> {
    return this.serviceCatalogService.update(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Post(':serviceId/lifecycle')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  transitionLifecycle(
    @Param('serviceId') serviceId: string,
    @Body() body: TransitionServiceLifecycleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceResponse> {
    return this.serviceCatalogService.transitionLifecycle(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Delete(':serviceId')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: 'serviceId' })
  async delete(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.serviceCatalogService.delete(
      serviceId,
      readCatalogMutationContext(request),
    );
  }
}
