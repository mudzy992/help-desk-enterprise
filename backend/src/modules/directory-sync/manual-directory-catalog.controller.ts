import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { readRequestIdHeader } from '../../common/request-context/read-request-id-header';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { CreateManualDirectoryOrganizationalUnitDto } from './dto/create-manual-directory-organizational-unit.dto';
import { UpdateManualDirectoryOrganizationalUnitDto } from './dto/update-manual-directory-organizational-unit.dto';
import { ManualDirectoryCatalogService } from './manual-directory-catalog.service';
import type { ManualDirectoryOrganizationalUnitResponse } from './manual-directory-catalog.types';
import type { OrganizationalUnitDeleteResponse } from '../organizational-units/organizational-unit-delete.types';

@Controller('directory-sync/manual-catalog/organizational-units')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.superAdmin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ManualDirectoryCatalogController {
  constructor(
    private readonly manualDirectoryCatalogService: ManualDirectoryCatalogService,
  ) {}

  @Get()
  list(): Promise<readonly ManualDirectoryOrganizationalUnitResponse[]> {
    return this.manualDirectoryCatalogService.listOrganizationalUnits();
  }

  @Post()
  create(
    @Body() body: CreateManualDirectoryOrganizationalUnitDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ManualDirectoryOrganizationalUnitResponse> {
    return this.manualDirectoryCatalogService.createOrganizationalUnit(
      body,
      readAuditContext(request),
    );
  }

  @Patch(':externalId')
  update(
    @Param('externalId') externalId: string,
    @Body() body: UpdateManualDirectoryOrganizationalUnitDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<ManualDirectoryOrganizationalUnitResponse> {
    return this.manualDirectoryCatalogService.updateOrganizationalUnit(
      decodeURIComponent(externalId),
      body,
      readAuditContext(request),
    );
  }

  @Delete(':externalId')
  delete(
    @Param('externalId') externalId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<OrganizationalUnitDeleteResponse> {
    return this.manualDirectoryCatalogService.deleteOrganizationalUnit(
      decodeURIComponent(externalId),
      readAuditContext(request),
    );
  }
}

function readAuditContext(request: AuthenticatedHttpRequest) {
  return {
    actorUserId: readAuthenticatedPrincipal(request)?.subjectId ?? null,
    requestId: readRequestIdHeader(request.headers),
  };
}
