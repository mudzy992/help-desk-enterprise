import { AdminConfigDomains } from '../../common/admin-realtime/admin-config-domain.decorator';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { AdminReadOperation } from '../authorization/admin-read-operation.decorator';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { readSettingsActorUserId } from '../settings/read-settings-actor-user-id';
import { ConfigVersioningService } from './config-versioning.service';
import {
  ConfigVersionReasonDto,
  CreateConfigVersionDto,
  DiffConfigVersionQueryDto,
  ExportConfigPackageQueryDto,
  ImportConfigPackageDto,
  RollbackConfigVersionDto,
} from './dto/config-version.dto';
import { configPackageMaxBytes } from './package/config-package.constants';
import { ConfigPackageService } from './package/config-package.service';
import {
  parseConfigPackageFile,
  parseConfigPackageMappings,
  readFlag,
} from './package/parse-import-options';
import { mapConfigVersioningError } from './map-config-versioning-error';

@Controller('config-versions')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ConfigVersioningController {
  constructor(
    private readonly configVersioningService: ConfigVersioningService,
    private readonly configPackageService: ConfigPackageService,
  ) {}

  /** Paket 2.9 (K4): dry run of an import — resolution report, nothing written. */
  @Post('import/preview')
  @AdminReadOperation()
  @RequirePermissions(permissionKeys.configVersionImport)
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: configPackageMaxBytes } }))
  previewImport(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() body: ImportConfigPackageDto,
  ) {
    return this.execute(async () =>
      this.configPackageService.previewImport(parseConfigPackageFile(file), {
        mappings: parseConfigPackageMappings(body.mappings),
        applyEnvironmentBound: readFlag(body.applyEnvironmentBound),
        confirmUnsigned: readFlag(body.confirmUnsigned),
      }),
    );
  }

  /** Paket 2.9 (K4): creates a DRAFT version from the package; never activates. */
  @Post('import')
  @RequirePermissions(permissionKeys.configVersionImport)
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: configPackageMaxBytes } }))
  importPackage(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() body: ImportConfigPackageDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.execute(async () =>
      this.configPackageService.importPackage(
        parseConfigPackageFile(file),
        {
          mappings: parseConfigPackageMappings(body.mappings),
          applyEnvironmentBound: readFlag(body.applyEnvironmentBound),
          confirmUnsigned: readFlag(body.confirmUnsigned),
          releaseNotes: body.releaseNotes,
        },
        readSettingsActorUserId(request),
      ),
    );
  }

  /** Paket 2.9 (K4): environment-neutral package of one version (download). */
  @Get(':id/export')
  @RequirePermissions(permissionKeys.settingsWrite)
  exportPackage(
    @Param('id') id: string,
    @Query() query: ExportConfigPackageQueryDto,
    @Req() request: AuthenticatedHttpRequest,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    return this.execute(async () => {
      const result = await this.configPackageService.exportPackage(
        id,
        { includeEnvironmentBound: readFlag(query.includeEnvironmentBound) },
        readSettingsActorUserId(request),
      );
      response.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      response.setHeader('Cache-Control', 'no-store');
      return result.body;
    });
  }

  @Post()
  @RequirePermissions(permissionKeys.settingsWrite)
  create(
    @Body() body: CreateConfigVersionDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.execute(() =>
      this.configVersioningService.create(
        body.releaseNotes,
        readSettingsActorUserId(request),
      ),
    );
  }

  @Get()
  list() {
    return this.execute(() => this.configVersioningService.list());
  }

  @Get(':id/diff')
  diff(@Param('id') id: string, @Query() query: DiffConfigVersionQueryDto) {
    return this.execute(() => this.configVersioningService.diff(id, query.againstId));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.execute(() => this.configVersioningService.get(id));
  }

  @Post(':id/validate')
  @AdminReadOperation()
  @RequirePermissions(permissionKeys.settingsWrite)
  validate(@Param('id') id: string) {
    return this.execute(() => this.configVersioningService.validate(id));
  }

  @AdminConfigDomains('routing', 'sla', 'catalog')
  @Post(':id/activate')
  @RequirePermissions(permissionKeys.settingsWrite)
  activate(
    @Body() body: ConfigVersionReasonDto,
    @Param('id') id: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.execute(() =>
      this.configVersioningService.activate(
        id,
        body.reason,
        readSettingsActorUserId(request),
      ),
    );
  }

  @AdminConfigDomains('routing', 'sla', 'catalog')
  @Post(':id/rollback')
  @RequirePermissions(permissionKeys.settingsWrite)
  rollback(
    @Body() body: RollbackConfigVersionDto,
    @Param('id') id: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.execute(() =>
      this.configVersioningService.rollback(
        id,
        body.reason,
        readSettingsActorUserId(request),
        body.targetVersionId,
      ),
    );
  }

  @Post(':id/shadow')
  @AdminReadOperation()
  @RequirePermissions(permissionKeys.settingsWrite)
  shadow(@Param('id') id: string) {
    return this.execute(() => this.configVersioningService.shadow(id));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapConfigVersioningError(error);
    }
  }
}
