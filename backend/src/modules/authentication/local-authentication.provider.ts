import { Injectable } from '@nestjs/common';
import { assertSuperAdminIsLocalOnly } from './assert-super-admin-is-local-only';
import {
  AuthenticationError,
  createInvalidCredentialsError,
} from './authentication.error';
import type {
  AuthenticatedPrincipal,
  AuthenticationCredentials,
  AuthenticationProvider,
} from './authentication.types';
import { AuthenticationUserLoader } from './authentication-user.loader';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import {
  isAcceptedLocalPasswordAuthentication,
  selectLocalPasswordHashForVerification,
} from './select-local-password-hash';
import { verifyLocalPassword } from './verify-local-password';

@Injectable()
export class LocalAuthenticationProvider implements AuthenticationProvider {
  constructor(
    private readonly authenticationUserLoader: AuthenticationUserLoader,
  ) {}

  async authenticate(
    credentials: AuthenticationCredentials,
  ): Promise<AuthenticatedPrincipal> {
    if (credentials.kind !== 'password') {
      throw createInvalidCredentialsError();
    }
    const user = await this.authenticationUserLoader.findByEmail(
      credentials.email,
    );
    const passwordHash = selectLocalPasswordHashForVerification(user, true);
    const isPasswordMatch = await verifyLocalPassword(
      credentials.password,
      passwordHash,
    );
    if (!isAcceptedLocalPasswordAuthentication(user, isPasswordMatch, true)) {
      throw createInvalidCredentialsError();
    }
    try {
      assertSuperAdminIsLocalOnly({
        isLocalOnly: user.isLocalOnly,
        entraObjectId: user.entraObjectId,
        roleKeys: user.roleKeys,
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw createInvalidCredentialsError();
      }
      throw error;
    }
    return createAuthenticatedPrincipal({
      subjectId: user.id,
      email: user.email,
      displayName: user.displayName,
      isLocalOnly: user.isLocalOnly,
    });
  }
}
