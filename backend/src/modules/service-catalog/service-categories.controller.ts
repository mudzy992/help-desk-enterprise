import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { RoleGuard } from '../authorization/role.guard';
import { CreateServiceCategoryDto } from './dto/create-service-category.dto';
import { UpdateServiceCategoryDto } from './dto/update-service-category.dto';
import { readCatalogMutationContext } from './read-catalog-mutation-context';
import { ServiceCatalogService } from './service-catalog.service';
import type { ServiceCategoryResponse } from './service-catalog.types';

@Controller('service-categories')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ServiceCategoriesController {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Post()
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  create(
    @Body() body: CreateServiceCategoryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceCategoryResponse> {
    return this.serviceCatalogService.createCategory(
      body,
      readCatalogMutationContext(request),
    );
  }

  @Get()
  list(): Promise<readonly ServiceCategoryResponse[]> {
    return this.serviceCatalogService.listCategories();
  }

  @Get(':serviceCategoryId')
  getById(
    @Param('serviceCategoryId') serviceCategoryId: string,
  ): Promise<ServiceCategoryResponse> {
    return this.serviceCatalogService.getCategory(serviceCategoryId);
  }

  @Patch(':serviceCategoryId')
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  update(
    @Param('serviceCategoryId') serviceCategoryId: string,
    @Body() body: UpdateServiceCategoryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceCategoryResponse> {
    return this.serviceCatalogService.updateCategory(
      serviceCategoryId,
      body,
      readCatalogMutationContext(request),
    );
  }

  @Delete(':serviceCategoryId')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  async delete(
    @Param('serviceCategoryId') serviceCategoryId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.serviceCatalogService.deleteCategory(
      serviceCategoryId,
      readCatalogMutationContext(request),
    );
  }
}
