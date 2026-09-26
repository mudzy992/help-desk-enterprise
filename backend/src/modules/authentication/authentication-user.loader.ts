import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmailAddress } from './normalize-email-address';
import type { AuthenticationUserRecord } from './authentication.types';

const authenticationUserInclude = {
  userRoles: {
    include: {
      role: {
        select: {
          key: true,
        },
      },
    },
  },
} as const;

type LoadedAuthenticationUser = {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  isLocalOnly: boolean;
  mustChangePassword: boolean;
  localPasswordHash: string | null;
  entraObjectId: string | null;
  passwordChangedAt?: Date | null;
  userRoles: readonly { role: { key: string } }[];
};

function mapAuthenticationUser(
  user: LoadedAuthenticationUser,
): AuthenticationUserRecord {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isActive: user.isActive,
    isLocalOnly: user.isLocalOnly,
    mustChangePassword: user.mustChangePassword,
    localPasswordHash: user.localPasswordHash,
    entraObjectId: user.entraObjectId,
    roleKeys: user.userRoles.map((userRole) => userRole.role.key),
    passwordChangedAt: user.passwordChangedAt ?? null,
  };
}

@Injectable()
export class AuthenticationUserLoader {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<AuthenticationUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmailAddress(email) },
      include: authenticationUserInclude,
    });
    if (user === null) {
      return null;
    }
    return mapAuthenticationUser(user);
  }

  async findById(subjectId: string): Promise<AuthenticationUserRecord | null> {
    const id = subjectId.trim();
    if (id.length === 0) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: authenticationUserInclude,
    });
    if (user === null) {
      return null;
    }
    return mapAuthenticationUser(user);
  }

  async findByEntraObjectId(
    entraObjectId: string,
  ): Promise<AuthenticationUserRecord | null> {
    const externalSubject = entraObjectId.trim();
    if (externalSubject.length === 0) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { entraObjectId: externalSubject },
      include: authenticationUserInclude,
    });
    if (user === null) {
      return null;
    }
    return mapAuthenticationUser(user);
  }
}
