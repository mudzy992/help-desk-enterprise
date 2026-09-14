import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Req,
  StreamableFile,
  UseGuards,
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
import { getRequestId } from '../../common/request-context/request-context.storage';
import { resolveRequestId } from '../../common/request-context/resolve-request-id';
import { readSettingsActorUserId } from '../settings/read-settings-actor-user-id';
import { mapObservabilityError } from './map-observability-error';
import { SupportBundleService } from './support-bundle.service';

@Controller('support-bundle')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.superAdmin)
@RequirePermissions(permissionKeys.supportBundleExport)
export class SupportBundleController {
  constructor(private readonly supportBundleService: SupportBundleService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async download(
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<StreamableFile> {
    const actorUserId = readSettingsActorUserId(request);
    if (actorUserId === null) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Authorization failed',
      });
    }
    try {
      const archive = await this.supportBundleService.createArchive({
        actorUserId,
        requestId: getRequestId() ?? resolveRequestId(request.headers),
      });
      return new StreamableFile(archive.buffer, {
        type: archive.contentType,
        disposition: `attachment; filename="${archive.fileName}"`,
      });
    } catch (error) {
      throw mapObservabilityError(error);
    }
  }
}
