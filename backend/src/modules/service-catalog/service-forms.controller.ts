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
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RequireServiceScope } from '../authorization/require-service-scope.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { CreateServiceFormDto } from './dto/create-service-form.dto';
import { CreateServiceFormVersionDto } from './dto/create-service-form-version.dto';
import { UpdateServiceFormVersionDto } from './dto/update-service-form-version.dto';
import { readCatalogMutationContext } from './read-catalog-mutation-context';
import { ServiceFormsService } from './service-forms.service';
import type {
  FormVersionResponse,
  ServiceFormResponse,
} from './service-forms.types';

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
  @RequireServiceScope({ field: 'serviceId' })
  getForm(@Param('serviceId') serviceId: string): Promise<ServiceFormResponse> {
    return this.serviceFormsService.getForm(serviceId);
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
  @RequireServiceScope({ field: 'serviceId' })
  getFormVersion(
    @Param('serviceId') serviceId: string,
    @Param('formVersionRef') formVersionRef: string,
  ): Promise<FormVersionResponse> {
    return this.serviceFormsService.getFormVersion(serviceId, formVersionRef);
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
