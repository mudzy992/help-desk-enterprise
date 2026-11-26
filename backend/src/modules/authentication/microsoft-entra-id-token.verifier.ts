import { Inject, Injectable, Optional } from '@nestjs/common';
import type { KeyObject } from 'node:crypto';
import { decode, verify } from 'jsonwebtoken';
import {
  AuthenticationError,
  createInvalidCredentialsError,
} from './authentication.error';
import { ENTRA_ID_TOKEN_FETCH } from './authentication.tokens';
import { entraAuthenticationConstants } from './entra-authentication.constants';
import type {
  EntraIdTokenVerificationInput,
  EntraIdTokenVerifier,
  NormalizedEntraIdentity,
} from './entra-id-token.verifier';
import { normalizeEntraIdTokenClaims } from './normalize-entra-id-token-claims';
import {
  createEntraJwksKeyResolver,
  type EntraJwksKeyResolver,
} from './entra-jwks-key-resolver';

@Injectable()
export class MicrosoftEntraIdTokenVerifier implements EntraIdTokenVerifier {
  /*
    W2.19 (`BA-authentication-06`): the verifier is a singleton, so it owns one
    resolver — and the resolver owns the JWKS cache, the fetch timeout, the
    single-flight refresh and the bounded document. One instance per process means
    a whole login burst shares one key document instead of one per sign-in.
  */
  private readonly jwksKeys: EntraJwksKeyResolver;

  constructor(
    @Optional()
    @Inject(ENTRA_ID_TOKEN_FETCH)
    fetchImplementation?: typeof fetch,
  ) {
    this.jwksKeys = createEntraJwksKeyResolver({
      fetchImplementation: fetchImplementation ?? fetch,
    });
  }

  async verify(
    input: EntraIdTokenVerificationInput,
  ): Promise<NormalizedEntraIdentity> {
    const idToken = input.idToken.trim();
    if (idToken.length === 0) {
      throw createInvalidCredentialsError();
    }
    const keyId = readSigningKeyId(idToken);
    const publicKey = await this.jwksKeys.resolve({
      jwksUrl: input.configuration.jwksUrl,
      keyId,
    });
    const payload = verifySignedEntraIdToken({
      idToken,
      publicKey,
      issuer: input.configuration.issuer,
      audience: input.configuration.clientId,
    });
    return normalizeEntraIdTokenClaims({
      payload,
      tenantId: input.configuration.tenantId,
    });
  }
}

function readSigningKeyId(idToken: string): string {
  const decoded = decode(idToken, { complete: true });
  if (
    decoded === null ||
    typeof decoded === 'string' ||
    decoded.header.alg !== entraAuthenticationConstants.idTokenSigningAlgorithm ||
    typeof decoded.header.kid !== 'string' ||
    decoded.header.kid.trim().length === 0
  ) {
    throw createInvalidCredentialsError();
  }
  return decoded.header.kid;
}

function verifySignedEntraIdToken(input: {
  readonly idToken: string;
  readonly publicKey: KeyObject;
  readonly issuer: string;
  readonly audience: string;
}): Readonly<Record<string, unknown>> {
  try {
    const payload = verify(input.idToken, input.publicKey, {
      algorithms: [entraAuthenticationConstants.idTokenSigningAlgorithm],
      issuer: input.issuer,
      audience: input.audience,
    });
    if (payload === null || typeof payload !== 'object') {
      throw createInvalidCredentialsError();
    }
    return payload as Readonly<Record<string, unknown>>;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw createInvalidCredentialsError();
  }
}
