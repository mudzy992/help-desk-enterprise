import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { CreateManualDirectoryOrganizationalUnitDto } from './dto/create-manual-directory-organizational-unit.dto';
import { UpdateManualDirectoryOrganizationalUnitDto } from './dto/update-manual-directory-organizational-unit.dto';
import { ManualDirectoryCatalogService } from './manual-directory-catalog.service';
import type { ManualDirectoryOrganizationalUnitResponse } from './manual-directory-catalog.types';

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
  ): Promise<ManualDirectoryOrganizationalUnitResponse> {
    return this.manualDirectoryCatalogService.createOrganizationalUnit(body);
  }

  @Patch(':externalId')
  update(
    @Param('externalId') externalId: string,
    @Body() body: UpdateManualDirectoryOrganizationalUnitDto,
  ): Promise<ManualDirectoryOrganizationalUnitResponse> {
    return this.manualDirectoryCatalogService.updateOrganizationalUnit(
      decodeURIComponent(externalId),
      body,
    );
  }

  @Delete(':externalId')
  @HttpCode(204)
  async delete(@Param('externalId') externalId: string): Promise<void> {
    await this.manualDirectoryCatalogService.deleteOrganizationalUnit(
      decodeURIComponent(externalId),
    );
  }
}
