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
import {
  readPrincipalContext,
  type AuthenticatedHttpRequest,
} from "../authentication/authenticated-request";
import {
  authorizationRoleKeys,
  permissionKeys,
} from "../authorization/authorization.constants";
import { RequirePermissions } from "../authorization/require-permissions.decorator";
import { RequireRoles } from "../authorization/require-roles.decorator";
import { RequireServiceScope } from "../authorization/require-service-scope.decorator";
import { RoleGuard } from "../authorization/role.guard";
import { catalogTicketCreateReadRoles } from "./catalog-ticket-create-read-roles";
import { CreateServiceDto } from "./dto/create-service.dto";
import { ListServicesQueryDto } from "./dto/list-services-query.dto";
import { TransitionServiceLifecycleDto } from "./dto/transition-service-lifecycle.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";
import { readCatalogMutationContext } from "./read-catalog-mutation-context";
import { ServiceCatalogService } from "./service-catalog.service";
import { serviceListVisibilityForPrincipal } from "./service-visible-lifecycles";
import type { ServiceListPage, ServiceResponse } from "./service-catalog.types";

type HeaderResponse = { setHeader(name: string, value: string): void };

function setRevisionEtag(response: HeaderResponse | undefined, revision: number): void {
  response?.setHeader("ETag", formatVersionEtag(revision));
}

@AdminConfigDomains("catalog")
@Controller("services")
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
  async create(
    @Body() body: CreateServiceDto,
    @Req() request: AuthenticatedHttpRequest,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ): Promise<ServiceResponse> {
    const service = await this.serviceCatalogService.create(
      body,
      readCatalogMutationContext(request),
    );
    setRevisionEtag(response, service.revision);
    return service;
  }

  @Get()
  @RequireRoles(...catalogTicketCreateReadRoles)
  list(
    @Query() query: ListServicesQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ServiceListPage> {
    // BA-12: service-scoped ADMIN assignments may read drafts only inside
    // their assigned services; a global ADMIN still receives the full catalog.
    return this.serviceCatalogService.list({
      ...query,
      ...serviceListVisibilityForPrincipal(readPrincipalContext(request)),
    });
  }

  @Get(":serviceId")
  @RequireRoles(...catalogTicketCreateReadRoles)
  @RequireServiceScope({ field: "serviceId" })
  async getById(
    @Param("serviceId") serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ): Promise<ServiceResponse> {
    const service = await this.serviceCatalogService.getById(
      serviceId,
      new Date(),
      readPrincipalContext(request)?.roleKeys ?? [],
    );
    setRevisionEtag(response, service.revision);
    return service;
  }

  @Patch(":serviceId")
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: "serviceId" })
  async update(
    @Param("serviceId") serviceId: string,
    @Body() body: UpdateServiceDto,
    @Req() request: AuthenticatedHttpRequest,
    @Headers("if-match") ifMatch: string | string[] | undefined,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ): Promise<ServiceResponse> {
    const service = await this.serviceCatalogService.update(
      serviceId,
      body,
      ifMatch,
      readCatalogMutationContext(request),
    );
    setRevisionEtag(response, service.revision);
    return service;
  }

  @Post(":serviceId/lifecycle")
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: "serviceId" })
  async transitionLifecycle(
    @Param("serviceId") serviceId: string,
    @Body() body: TransitionServiceLifecycleDto,
    @Req() request: AuthenticatedHttpRequest,
    @Headers("if-match") ifMatch: string | string[] | undefined,
    @Res({ passthrough: true }) response?: HeaderResponse,
  ): Promise<ServiceResponse> {
    const service = await this.serviceCatalogService.transitionLifecycle(
      serviceId,
      body,
      ifMatch,
      readCatalogMutationContext(request),
    );
    setRevisionEtag(response, service.revision);
    return service;
  }

  @Delete(":serviceId")
  @HttpCode(204)
  @RequirePermissions(permissionKeys.serviceCatalogWrite)
  @RequireServiceScope({ field: "serviceId" })
  async delete(
    @Param("serviceId") serviceId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.serviceCatalogService.delete(
      serviceId,
      readCatalogMutationContext(request),
    );
  }
}
