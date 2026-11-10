import { AdminConfigDomains } from "../../common/admin-realtime/admin-config-domain.decorator";
import { formatVersionEtag } from "../../common/optimistic-concurrency/optimistic-concurrency.service";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { SessionAuthenticationGuard } from "../authentication/session-authentication.guard";
import type { AuthenticatedHttpRequest } from "../authentication/authenticated-request";
import {
  authorizationRoleKeys,
  permissionKeys,
} from "../authorization/authorization.constants";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { RequireRoles } from "../authorization/require-roles.decorator";
import { RoleGuard } from "../authorization/role.guard";
import { CatalogMutationReasonDto } from "./dto/catalog-mutation-reason.dto";
import { CreateServiceCategoryDto } from "./dto/create-service-category.dto";
import { ListServiceCategoriesQueryDto } from "./dto/list-service-categories-query.dto";
import { UpdateServiceCategoryDto } from "./dto/update-service-category.dto";
import { readCatalogMutationContext } from "./read-catalog-mutation-context";
import { ServiceCatalogService } from "./service-catalog.service";
import type {
  ServiceCategoryListPage,
  ServiceCategoryResponse,
} from "./service-catalog.types";

type HeaderResponse = { setHeader(name: string, value: string): void };

function setRevisionEtag(
  response: HeaderResponse | undefined,
  revision: number,
): void {
  response?.setHeader("ETag", formatVersionEtag(revision));
}

@AdminConfigDomains("catalog")
@Controller("service-categories")
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
  async create(
    @Body() body: CreateServiceCategoryDto,
    @Req() request: AuthenticatedHttpRequest,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ): Promise<ServiceCategoryResponse> {
    const category = await this.serviceCatalogService.createCategory(
      body,
      readCatalogMutationContext(request),
    );
    setRevisionEtag(response, category.revision);
    return category;
  }

  @Get()
  list(
    @Query() query: ListServiceCategoriesQueryDto,
  ): Promise<ServiceCategoryListPage> {
    return this.serviceCatalogService.listCategories(query);
  }

  @Get(":serviceCategoryId")
  async getById(
    @Param("serviceCategoryId") serviceCategoryId: string,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ): Promise<ServiceCategoryResponse> {
    const category =
      await this.serviceCatalogService.getCategory(serviceCategoryId);
    setRevisionEtag(response, category.revision);
    return category;
  }

  @Patch(":serviceCategoryId")
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  async update(
    @Param("serviceCategoryId") serviceCategoryId: string,
    @Body() body: UpdateServiceCategoryDto,
    @Req() request: AuthenticatedHttpRequest,
    @Headers("if-match") ifMatch: string | string[] | undefined,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ): Promise<ServiceCategoryResponse> {
    const category = await this.serviceCatalogService.updateCategory(
      serviceCategoryId,
      body,
      ifMatch,
      readCatalogMutationContext(request),
    );
    setRevisionEtag(response, category.revision);
    return category;
  }

  @Delete(":serviceCategoryId")
  @HttpCode(204)
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  async delete(
    @Param("serviceCategoryId") serviceCategoryId: string,
    @Query() query: CatalogMutationReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.serviceCatalogService.deleteCategory(
      serviceCategoryId,
      readCatalogMutationContext(request),
      query.reason,
    );
  }
}
