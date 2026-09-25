import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { authenticationConstants } from './authentication.constants';
import type { AuthenticationSessionResponse } from './authentication.types';
import type { AuthenticationUserLoader } from './authentication-user.loader';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import { hashLocalPassword } from './hash-local-password';
import { isValidLocalPassword } from './is-valid-local-password';
import type { SessionTokenService } from './session-token.service';
import { toAuthorizationPrincipal } from './to-authorization-principal';

export async function changePasswordWithToken(input: {
  readonly sessionTokenService: SessionTokenService;
  readonly authenticationUserLoader: AuthenticationUserLoader;
  readonly prisma: PrismaService;
  readonly passwordChangeToken: string;
  readonly newPassword: string;
}): Promise<AuthenticationSessionResponse> {
  const claims = await input.sessionTokenService.verifyPasswordChangeToken(
    input.passwordChangeToken,
  );
  const user = await input.authenticationUserLoader.findById(claims.subjectId);
  if (user === null || !user.isActive || !user.mustChangePassword) {
    throw new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Authentication failed',
    });
  }
  if (!isValidLocalPassword(input.newPassword, user.email)) {
    throw new BadRequestException({
      code: 'INVALID_PASSWORD',
      message: 'Password does not meet requirements',
    });
  }
  const localPasswordHash = await hashLocalPassword(input.newPassword);
  await input.prisma.user.update({
    where: { id: user.id },
    data: {
      localPasswordHash,
      mustChangePassword: false,
    },
  });
  const principal = createAuthenticatedPrincipal({
    subjectId: user.id,
    email: user.email,
    displayName: user.displayName,
    isLocalOnly: user.isLocalOnly,
  });
  // Review 2026-09-25 (S2): sessions issued before the new password stop working.
  await input.sessionTokenService.revokeAllForUser(user.id);
  const accessToken = await input.sessionTokenService.issue(principal);
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresInSeconds: authenticationConstants.sessionTtlSeconds,
    principal: toAuthorizationPrincipal(principal),
  };
}
