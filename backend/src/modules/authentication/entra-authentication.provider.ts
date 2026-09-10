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
  ExternalIdentityAuthenticationCredentials,
  PasswordAuthenticationCredentials,
} from './authentication.types';
import { AuthenticationUserLoader } from './authentication-user.loader';
import { canBindExternalIdentity } from './can-bind-external-identity';
import { createAuthenticatedPrincipal } from './create-authenticated-principal';
import { normalizeEmailAddress } from './normalize-email-address';
import {
  isAcceptedLocalPasswordAuthentication,
  selectLocalPasswordHashForVerification,
} from './select-local-password-hash';
import { verifyLocalPassword } from './verify-local-password';

@Injectable()
export class EntraAuthenticationProvider implements AuthenticationProvider {
  constructor(
    private readonly authenticationUserLoader: AuthenticationUserLoader,
  ) {}

  async authenticate(
    credentials: AuthenticationCredentials,
  ): Promise<AuthenticatedPrincipal> {
    if (credentials.kind === 'password') {
      return this.authenticateLocalOnlyPassword(credentials);
    }
    return this.rejectExternalIdentity(credentials);
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

  private async rejectExternalIdentity(
    credentials: ExternalIdentityAuthenticationCredentials,
  ): Promise<AuthenticatedPrincipal> {
    const user = await this.findExternalIdentityCandidate(credentials);
    if (user !== null && !canBindExternalIdentity(user)) {
      throw createInvalidCredentialsError();
    }
    throw createInvalidCredentialsError();
  }

  private async findExternalIdentityCandidate(
    credentials: ExternalIdentityAuthenticationCredentials,
  ): Promise<AuthenticationUserRecord | null> {
    const byExternalSubject =
      await this.authenticationUserLoader.findByEntraObjectId(
        credentials.externalSubject,
      );
    if (byExternalSubject !== null) {
      return byExternalSubject;
    }
    return this.authenticationUserLoader.findByEmail(
      normalizeEmailAddress(credentials.email),
    );
  }
}
