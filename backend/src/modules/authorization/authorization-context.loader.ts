import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { createAuthorizationContext } from './create-authorization-context';
import type {
  AuthorizationAssignment,
  AuthorizationContext,
} from './authorization.types';

const authorizationUserInclude = {
  userRoles: {
    include: {
      role: {
        select: {
          key: true,
          rolePermissions: {
            select: {
              permission: {
                select: {
                  key: true,
                },
              },
            },
          },
        },
      },
      organizationalUnit: {
        select: {
          id: true,
          ouPath: true,
        },
      },
      service: {
        select: {
          id: true,
        },
      },
    },
  },
} as const;

type LoadedAuthorizationUser = {
  id: string;
  isActive: boolean;
  isLocalOnly: boolean;
  entraObjectId: string | null;
  userRoles: readonly {
    role: {
      key: string;
      rolePermissions: readonly { permission: { key: string } }[];
    };
    organizationalUnit: { id: string; ouPath: string } | null;
    service: { id: string } | null;
  }[];
};

function mapAssignments(
  user: LoadedAuthorizationUser,
): readonly AuthorizationAssignment[] {
  return user.userRoles.map((userRole) => ({
    roleKey: userRole.role.key,
    permissionKeys: userRole.role.rolePermissions.map(
      (rolePermission) => rolePermission.permission.key,
    ),
    organizationalUnitId: userRole.organizationalUnit?.id ?? null,
    organizationalUnitPath: userRole.organizationalUnit?.ouPath ?? null,
    serviceId: userRole.service?.id ?? null,
  }));
}

@Injectable()
export class AuthorizationContextLoader {
  constructor(private readonly prisma: PrismaService) {}

  async loadBySubjectId(
    subjectId: string,
  ): Promise<AuthorizationContext | null> {
    const id = subjectId.trim();
    if (id.length === 0) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: authorizationUserInclude,
    });
    if (user === null) {
      return null;
    }
    return createAuthorizationContext({
      id: user.id,
      isActive: user.isActive,
      isLocalOnly: user.isLocalOnly,
      entraObjectId: user.entraObjectId,
      assignments: mapAssignments(user),
    });
  }
}
