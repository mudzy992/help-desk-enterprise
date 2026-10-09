import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PasskeyCredentialService,
} from '../authentication/security/passkey-credential.service';
import {
  PasskeyChallengeStoreProvider,
  type PasskeyChallengeStore,
} from '../authentication/security/passkey-challenge.store';
import { WebAuthnRpLoader } from '../authentication/security/webauthn-rp.loader';

/*
  Paket 5.4.0-a (M1): passkey step-up for sensitive actions. The privacy
  identity confirmer used to accept only a TOTP code or a 15-minute-fresh
  session; an account whose passkey is the only enrolled factor could not
  confirm anything. The flow:

  1. `POST /security/identity/passkey/start` — session-authenticated, issues
     WebAuthn options with `userVerification: 'required'`; the challenge lives
     in Redis keyed by the session id and purpose.
  2. `POST /security/identity/passkey/verify` — verifies the assertion and
     leaves a single-use, 2-minute confirmation marker the privacy confirmer
     consumes in place of a TOTP code.
*/

const stepUpChallengeTtlSeconds = 2 * 60;
export const passkeyStepUpMarkerTtlSeconds = 2 * 60;

export function stepUpChallengeKey(sessionId: string, purpose: string): string {
  return `webauthn:step:${sessionId}:${purpose}`;
}

function stepUpMarkerKey(sessionId: string, purpose: string): string {
  return `webauthn:step-ok:${sessionId}:${purpose}`;
}

/**
 * The marker value binds the confirmation to the verified credential row so a
 * replay of a captured marker (or a marker from another credential) is inert.
 */
function markerValue(credentialRowId: string): string {
  return createHash('sha256').update(`passkey-step-up:${credentialRowId}`).digest('hex');
}

export class PasskeyIdentityError extends Error {
  constructor(readonly code: 'IDENTITY_CONFIRMATION_REQUIRED' | 'IDENTITY_CONFIRMATION_FAILED') {
    super(code);
    this.name = 'PasskeyIdentityError';
  }
}

@Injectable()
export class IdentityPasskeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: PasskeyChallengeStoreProvider,
    private readonly passkeyCredentialService: PasskeyCredentialService,
    private readonly webAuthnRpLoader: WebAuthnRpLoader,
  ) {}

  async start(
    sessionId: string,
    userId: string,
    purpose: string,
  ): Promise<{ options: Record<string, unknown> }> {
    const credentials = await this.prisma.userPasskeyCredential.findMany({
      where: { userId },
      select: { credentialId: true },
    });
    if (credentials.length === 0) {
      throw new PasskeyIdentityError('IDENTITY_CONFIRMATION_REQUIRED');
    }
    // The options generation (and the challenge) belong to the auth module's
    // service; a session-scoped challenge key keeps purposes isolated.
    const challenge = randomBytes(32).toString('base64url');
    await this.challenges.store.set(stepUpChallengeKey(sessionId, purpose), challenge, stepUpChallengeTtlSeconds);
    const rp = this.webAuthnRpLoader.load();
    if (rp === null) throw new PasskeyIdentityError('IDENTITY_CONFIRMATION_REQUIRED');
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: 'required',
      allowCredentials: credentials.map((row) => ({ id: row.credentialId })),
      challenge,
    });
    return { options: options as unknown as Record<string, unknown> };
  }

  async verify(
    sessionId: string,
    userId: string,
    purpose: string,
    assertion: Record<string, unknown>,
    ip: string | null,
  ): Promise<void> {
    const rp = this.webAuthnRpLoader.load();
    if (rp === null) throw new PasskeyIdentityError('IDENTITY_CONFIRMATION_FAILED');
    try {
      const { credentialRowId } = await this.passkeyCredentialService.verifyAssertion(
        userId,
        stepUpChallengeKey(sessionId, purpose),
        assertion as unknown as AuthenticationResponseJSON,
        rp,
        true,
        ip,
      );
      await this.markerStore().set(
        stepUpMarkerKey(sessionId, purpose),
        markerValue(credentialRowId),
        passkeyStepUpMarkerTtlSeconds,
      );
    } catch {
      // The assertion never reveals which check failed.
      throw new PasskeyIdentityError('IDENTITY_CONFIRMATION_FAILED');
    }
  }

  /**
   * Consumed by `PrivacyIdentityConfirmer`: a fresh passkey step-up counts as
   * the proof of identity, without typing a TOTP code.
   */
  async consumeFreshConfirmation(sessionId: string, purpose: string): Promise<boolean> {
    const key = stepUpMarkerKey(sessionId, purpose);
    const value = await this.markerStore().consume(key);
    return value !== null;
  }

  private markerStore(): PasskeyChallengeStore {
    // The marker is only checked with the caller's own session id, so the
    // challenge store (Redis or in-memory) is the right home for it too.
    return this.challenges.store;
  }
}
