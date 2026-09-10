import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { AuthorizationContextLoader } from './authorization-context.loader';
import { evaluateAuthorizationAccess } from './evaluate-authorization-access';
import type { AuthorizationRequirements } from './authorization.types';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly prisma: PrismaService,
  ) {}

  async authorize(input: {
    readonly principal: AuthorizationPrincipal | null;
    readonly requirements: AuthorizationRequirements;
    readonly organizationalUnitId: string | null;
    readonly serviceId: string | null;
  }): Promise<boolean> {
    if (input.principal === null || input.principal.subjectId.trim().length === 0) {
      return false;
    }
    const context = await this.authorizationContextLoader.loadBySubjectId(
      input.principal.subjectId,
    );
    if (context === null) {
      return false;
    }
    const organizationalUnitPath = input.requirements.requireOrganizationalUnitScope
      ? await this.loadOrganizationalUnitPath(input.organizationalUnitId)
      : null;
    if (
      input.requirements.requireOrganizationalUnitScope &&
      organizationalUnitPath === null
    ) {
      return false;
    }
    if (input.requirements.requireServiceScope) {
      const serviceExists = await this.serviceExists(input.serviceId);
      if (!serviceExists) {
        return false;
      }
    }
    return evaluateAuthorizationAccess({
      context,
      requiredRoles: input.requirements.requiredRoles,
      requiredPermissions: input.requirements.requiredPermissions,
      organizationalUnitId: input.organizationalUnitId,
      organizationalUnitPath,
      serviceId: input.serviceId,
      requireOrganizationalUnitScope:
        input.requirements.requireOrganizationalUnitScope,
      requireServiceScope: input.requirements.requireServiceScope,
    });
  }

  async loadOrganizationalUnitPath(
    organizationalUnitId: string | null,
  ): Promise<string | null> {
    if (organizationalUnitId === null || organizationalUnitId.trim().length === 0) {
      return null;
    }
    const record = await this.prisma.organizationalUnit.findUnique({
      where: { id: organizationalUnitId.trim() },
      select: { ouPath: true },
    });
    if (record === null || record.ouPath.trim().length === 0) {
      return null;
    }
    return record.ouPath;
  }

  async serviceExists(serviceId: string | null): Promise<boolean> {
    if (serviceId === null || serviceId.trim().length === 0) {
      return false;
    }
    const record = await this.prisma.service.findUnique({
      where: { id: serviceId.trim() },
      select: { id: true },
    });
    return record !== null;
  }
}
