import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
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
  RollbackConfigVersionDto,
} from './dto/config-version.dto';
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
  constructor(private readonly configVersioningService: ConfigVersioningService) {}

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
