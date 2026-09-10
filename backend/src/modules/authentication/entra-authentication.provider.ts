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
  AuthenticationUserRecord,
  EntraIdTokenAuthenticationCredentials,
  PasswordAuthenticationCredentials,
} from './authentication.types';
import { AuthenticationUserLoader } from './authentication-user.loader';
import { canBindExternalIdentity } from './can-bind-external-identity';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import { EntraAuthenticationConfigurationLoader } from './entra-authentication-configuration.loader';
import { MicrosoftEntraIdTokenVerifier } from './microsoft-entra-id-token.verifier';
import {
  isAcceptedLocalPasswordAuthentication,
  selectLocalPasswordHashForVerification,
} from './select-local-password-hash';
import { verifyLocalPassword } from './verify-local-password';

@Injectable()
export class EntraAuthenticationProvider implements AuthenticationProvider {
  constructor(
    private readonly authenticationUserLoader: AuthenticationUserLoader,
    private readonly entraAuthenticationConfigurationLoader: EntraAuthenticationConfigurationLoader,
    private readonly entraIdTokenVerifier: MicrosoftEntraIdTokenVerifier,
  ) {}

  async authenticate(
    credentials: AuthenticationCredentials,
  ): Promise<AuthenticatedPrincipal> {
    if (credentials.kind === 'password') {
      return this.authenticateLocalOnlyPassword(credentials);
    }
    return this.authenticateEntraIdToken(credentials);
  }

  private async authenticateLocalOnlyPassword(
    credentials: PasswordAuthenticationCredentials,
  ): Promise<AuthenticatedPrincipal> {
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
    return materializeAuthenticatedPrincipal(user);
  }

  private async authenticateEntraIdToken(
    credentials: EntraIdTokenAuthenticationCredentials,
  ): Promise<AuthenticatedPrincipal> {
    if (credentials.idToken.trim().length === 0) {
      throw createInvalidCredentialsError();
    }
    const configuration =
      await this.entraAuthenticationConfigurationLoader.load();
    const identity = await this.entraIdTokenVerifier.verify({
      idToken: credentials.idToken,
      configuration,
    });
    const user = await this.authenticationUserLoader.findByEntraObjectId(
      identity.externalSubject,
    );
    if (
      user === null ||
      !user.isActive ||
      !canBindExternalIdentity(user)
    ) {
      throw createInvalidCredentialsError();
    }
    return materializeAuthenticatedPrincipal(user);
  }
}

function materializeAuthenticatedPrincipal(
  user: AuthenticationUserRecord,
): AuthenticatedPrincipal {
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
  try {
    return createAuthenticatedPrincipal({
      subjectId: user.id,
      email: user.email,
      displayName: user.displayName,
      isLocalOnly: user.isLocalOnly,
    });
  } catch {
    throw createInvalidCredentialsError();
  }
}
