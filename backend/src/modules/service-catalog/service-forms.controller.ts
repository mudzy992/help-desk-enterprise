import { AdminConfigDomains } from '../../common/admin-realtime/admin-config-domain.decorator';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import {
  readPrincipalContext,
  type AuthenticatedHttpRequest,
} from '../authentication/authenticated-request';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RequireServiceScope } from '../authorization/require-service-scope.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { catalogTicketCreateReadRoles } from './catalog-ticket-create-read-roles';
import { CreateServiceFormDto } from './dto/create-service-form.dto';
import { CreateServiceFormVersionDto } from './dto/create-service-form-version.dto';
import { UpdateServiceFormVersionDto } from './dto/update-service-form-version.dto';
import { readCatalogMutationContext } from './read-catalog-mutation-context';
import { ServiceFormsService } from './service-forms.service';
import type {
  FormVersionResponse,
  ServiceFormResponse,
} from './service-forms.types';

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
export class ServiceFormsController {
  constructor(private readonly serviceFormsService: ServiceFormsService) {}

  @Post(':serviceId/form')
  @RequirePermissions(permissionKeys.serviceFormsWrite)
  @RequireServiceScope({ field: 'serviceId' })
  createForm(
    @Param('serviceId') serviceId: string,
    @Body() body: CreateServiceFormDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<FormVersionResponse> {
    return this.serviceFormsService.createForm(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Get(':serviceId/form')
  @RequireRoles(...catalogTicketCreateReadRoles)
  @RequireServiceScope({ field: 'serviceId' })
  getForm(
    @Param('serviceId') serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceFormResponse> {
    // Val 2 (M6/B2): šema forme nacrta nije javna (RAW `:304`).
    return this.serviceFormsService.getForm(
      serviceId,
      readPrincipalContext(request)?.roleKeys ?? [],
    );
  }

  @Post(':serviceId/form/versions')
  @RequirePermissions(permissionKeys.serviceFormsWrite)
  @RequireServiceScope({ field: 'serviceId' })
  createFormVersion(
    @Param('serviceId') serviceId: string,
    @Body() body: CreateServiceFormVersionDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<FormVersionResponse> {
    return this.serviceFormsService.createFormVersion(
      serviceId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Get(':serviceId/form/versions/:formVersionRef')
  @RequireRoles(...catalogTicketCreateReadRoles)
  @RequireServiceScope({ field: 'serviceId' })
  getFormVersion(
    @Param('serviceId') serviceId: string,
    @Param('formVersionRef') formVersionRef: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<FormVersionResponse> {
    return this.serviceFormsService.getFormVersion(
      serviceId,
      formVersionRef,
      readPrincipalContext(request)?.roleKeys ?? [],
    );
  }

  @Patch(':serviceId/form/versions/:formVersionRef')
  @RequirePermissions(permissionKeys.serviceFormsWrite)
  @RequireServiceScope({ field: 'serviceId' })
  updateFormVersion(
    @Param('serviceId') serviceId: string,
    @Param('formVersionRef') formVersionRef: string,
    @Body() body: UpdateServiceFormVersionDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<FormVersionResponse> {
    return this.serviceFormsService.updateFormVersion(
      serviceId,
      formVersionRef,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Post(':serviceId/form/versions/:formVersionRef/activate')
  @RequirePermissions(permissionKeys.serviceFormsWrite)
  @RequireServiceScope({ field: 'serviceId' })
  activateFormVersion(
    @Param('serviceId') serviceId: string,
    @Param('formVersionRef') formVersionRef: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<FormVersionResponse> {
    return this.serviceFormsService.activateFormVersion(
      serviceId,
      formVersionRef,
      readCatalogMutationContext(request),
    );
  }
}
