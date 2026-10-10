import { Injectable } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { authenticationConstants } from '../authentication.constants';
import { AccountSecurityError } from './account-security.error';
import type { AccountSecurityPolicy } from './account-security-policy';
import { auditLogActions } from '../../audit-log/audit-log.constants';
import { notificationTypes } from '../../notifications/notifications.constants';
import { AccountSecurityNotifier } from './account-security-notifier';
import type { WebAuthnRpConfiguration } from './webauthn-rp.configuration';
import { PasskeyChallengeStoreProvider } from './passkey-challenge.store';

/*
  Paket 5.4.0-a (M1): passkey (WebAuthn / FIDO2) as a second factor next to the
  existing TOTP. The service owns the credentials table and the ceremonies:

  - registration (profile): options → attestation → store the credential;
  - authentication (login MFA step): options bound to the mfa token →
    assertion → counter check → the caller issues the session;
  - step-up (sensitive actions) lives in the security module and reuses the
    verification primitives from here through `verifyAssertion`.

  The counter must be monotonic; a non-increasing counter means the
  authenticator was cloned, so the factor is invalidated at once. Recovery
  codes keep working for both factors unchanged.
*/

const registrationChallengeTtlSeconds = 3 * 60;
const authenticationChallengeTtlSeconds = 3 * 60;

export type PasskeyView = {
  readonly id: string;
  readonly deviceName: string | null;
  readonly aaguid: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly isBackedUp: boolean;
};

/** What a login-time assertion proves: the mfa token's subject (never the raw token). */
export type PasskeyAuthenticationSubject = {
  readonly userId: string;
  readonly challengeKey: string;
  readonly ip: string | null;
};

@Injectable()
export class PasskeyCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: PasskeyChallengeStoreProvider,
    private readonly notifier: AccountSecurityNotifier,
  ) {}

  /** Passkeys are a local-account factor; Entra accounts are managed by Entra. */
  async isAvailable(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { localPasswordHash: true, entraObjectId: true },
    });
    return user !== null && user.localPasswordHash !== null && user.entraObjectId === null;
  }

  async listCredentials(userId: string): Promise<PasskeyView[]> {
    const rows = await this.prisma.userPasskeyCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        deviceName: true,
        aaguid: true,
        createdAt: true,
        lastUsedAt: true,
        isBackedUp: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      deviceName: row.deviceName,
      aaguid: row.aaguid,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      isBackedUp: row.isBackedUp,
    }));
  }

  async countCredentials(userId: string): Promise<number> {
    return this.prisma.userPasskeyCredential.count({ where: { userId } });
  }

  /**
   * Profile registration (Paket 5.4.0-a): the RP config must exist or the
   * factor is unavailable rather than half-working.
   */
  async startRegistration(
    subject: { readonly id: string; readonly email: string },
    rp: WebAuthnRpConfiguration | null,
  ): Promise<{ options: Record<string, unknown> }> {
    if (rp === null) throw new AccountSecurityError('MFA_UNAVAILABLE');
    if (!(await this.isAvailable(subject.id))) throw new AccountSecurityError('MFA_NOT_AVAILABLE');
    const existing = await this.prisma.userPasskeyCredential.findMany({
      where: { userId: subject.id },
      select: { credentialId: true },
    });
    const options = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpID,
      userID: utf8Bytes(subject.id),
      userName: subject.email,
      attestationType: 'none',
      excludeCredentials: existing.map((row) => ({ id: row.credentialId })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });
    await this.challenges.store.set(
      this.registrationChallengeKey(subject.id),
      options.challenge,
      registrationChallengeTtlSeconds,
    );
    return { options: options as unknown as Record<string, unknown> };
  }

  async confirmRegistration(
    subject: {
      readonly id: string;
      readonly email: string;
      readonly localPasswordHash: string | null;
      readonly entraObjectId: string | null;
      readonly roleKeys: readonly string[];
    },
    response: RegistrationResponseJSON,
    rp: WebAuthnRpConfiguration | null,
    ip: string | null,
    now: Date = new Date(),
  ): Promise<PasskeyView> {
    if (rp === null) throw new AccountSecurityError('MFA_UNAVAILABLE');
    if (!(await this.isAvailable(subject.id))) throw new AccountSecurityError('MFA_NOT_AVAILABLE');
    const expectedChallenge = await this.challenges.store.consume(this.registrationChallengeKey(subject.id));
    if (expectedChallenge === null) throw new AccountSecurityError('MFA_ENROLLMENT_EXPIRED');
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: [...rp.expectedOrigins],
      expectedRPID: rp.rpID,
      requireUserVerification: false,
    }).catch(() => {
      throw new AccountSecurityError('MFA_INVALID_CODE');
    });
    if (!verification.verified || verification.registrationInfo === undefined) {
      throw new AccountSecurityError('MFA_INVALID_CODE');
    }
    const info = verification.registrationInfo;
    const row = await this.prisma.userPasskeyCredential.create({
      data: {
        userId: subject.id,
        credentialId: info.credential.id,
        publicKey: toBase64Url(info.credential.publicKey),
        counter: BigInt(info.credential.counter),
        transports: info.credential.transports?.length ? info.credential.transports.join(',') : null,
        aaguid: info.aaguid && info.aaguid.length > 0 ? info.aaguid : null,
        isBackupEligible: info.credentialDeviceType === 'singleDevice' ? false : true,
        isBackedUp: info.credentialBackedUp,
        lastUsedAt: now,
        lastUsedIp: ip,
      },
      select: {
        id: true,
        deviceName: true,
        aaguid: true,
        createdAt: true,
        lastUsedAt: true,
        isBackedUp: true,
      },
    });
    await this.notifier.audit(auditLogActions.authMfaPasskeyEnrolled, subject.id, subject.id, {
      aaguid: row.aaguid,
    });
    await this.notifier.notify(
      subject.id,
      notificationTypes.accountMfaChanged,
      null,
      `passkey-added:${subject.id}:${now.getTime()}`,
    );
    return {
      id: row.id,
      deviceName: row.deviceName,
      aaguid: row.aaguid,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      isBackedUp: row.isBackedUp,
    };
  }

  /**
   * Login MFA step: options scoped to the caller's credentials. The challenge
   * is bound to the mfa token's jti, so parallel sign-ins cannot interfere.
   */
  async startAuthentication(
    userId: string,
    challengeKey: string,
    rp: WebAuthnRpConfiguration | null,
  ): Promise<{ options: Record<string, unknown> }> {
    if (rp === null) throw new AccountSecurityError('MFA_UNAVAILABLE');
    const credentials = await this.prisma.userPasskeyCredential.findMany({
      where: { userId },
      select: { credentialId: true, transports: true },
    });
    if (credentials.length === 0) throw new AccountSecurityError('MFA_NOT_ENABLED');
    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      userVerification: 'preferred',
      allowCredentials: credentials.map((row) => ({
        id: row.credentialId,
        transports: parseTransports(row.transports),
      })),
    });
    await this.challenges.store.set(challengeKey, options.challenge, authenticationChallengeTtlSeconds);
    return { options: options as unknown as Record<string, unknown> };
  }

  /**
   * Verifies a login-time or step-up assertion. Returns the credential row id
   * on success; the caller decides what the proof unlocks.
   */
  async verifyAssertion(
    userId: string,
    challengeKey: string,
    response: AuthenticationResponseJSON,
    rp: WebAuthnRpConfiguration | null,
    requireUserVerification: boolean,
    ip: string | null,
    now: Date = new Date(),
  ): Promise<{ credentialRowId: string }> {
    if (rp === null) throw new AccountSecurityError('MFA_UNAVAILABLE');
    const expectedChallenge = await this.challenges.store.consume(challengeKey);
    if (expectedChallenge === null) throw new AccountSecurityError('MFA_INVALID_CODE');
    const credential = await this.prisma.userPasskeyCredential.findFirst({
      where: { userId, credentialId: response.id },
      select: {
        id: true,
        credentialId: true,
        publicKey: true,
        counter: true,
        transports: true,
      },
    });
    if (credential === null) throw new AccountSecurityError('MFA_INVALID_CODE');
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: [...rp.expectedOrigins],
      expectedRPID: rp.rpID,
      credential: {
        id: credential.credentialId,
        publicKey: fromBase64Url(credential.publicKey),
        counter: Number(credential.counter),
        transports: parseTransports(credential.transports),
      },
      requireUserVerification,
    }).catch(() => {
      throw new AccountSecurityError('MFA_INVALID_CODE');
    });
    if (!verification.verified) throw new AccountSecurityError('MFA_INVALID_CODE');
    const newCounter = verification.authenticationInfo.newCounter;
    if (Number(credential.counter) > 0 && newCounter <= Number(credential.counter)) {
      // Cloned authenticator: drop the factor before it can be used again.
      await this.prisma.userPasskeyCredential.deleteMany({ where: { userId } });
      throw new AccountSecurityError('PASSKEY_CLONED');
    }
    await this.prisma.userPasskeyCredential.update({
      where: { id: credential.id },
      data: { counter: BigInt(Math.max(newCounter, 0)), lastUsedAt: now, lastUsedIp: ip },
    });
    return { credentialRowId: credential.id };
  }

  /**
   * Removal keeps at least one factor when the account requires MFA: the
   * caller passes whether another factor (TOTP) remains.
   */
  async removeCredential(
    subject: {
      readonly id: string;
      readonly localPasswordHash: string | null;
      readonly entraObjectId: string | null;
      readonly roleKeys: readonly string[];
    },
    policy: AccountSecurityPolicy,
    credentialRowId: string,
    actorUserId: string | null,
    otherFactorRemaining: boolean,
    now: Date = new Date(),
  ): Promise<void> {
    const owned = await this.prisma.userPasskeyCredential.findFirst({
      where: { id: credentialRowId, userId: subject.id },
      select: { id: true },
    });
    if (owned === null) throw new AccountSecurityError('PASSKEY_NOT_FOUND');
    const remainingPasskeys = (await this.countCredentials(subject.id)) - 1;
    if (!otherFactorRemaining && remainingPasskeys <= 0 && mfaIsRequired(subject, policy)) {
      throw new AccountSecurityError('MFA_REQUIRED_CANNOT_DISABLE');
    }
    await this.prisma.userPasskeyCredential.delete({ where: { id: credentialRowId } });
    await this.notifier.audit(auditLogActions.authMfaPasskeyRemoved, subject.id, actorUserId);
    await this.notifier.notify(
      subject.id,
      notificationTypes.accountMfaChanged,
      null,
      `passkey-removed:${subject.id}:${now.getTime()}`,
    );
  }

  private registrationChallengeKey(userId: string): string {
    return `webauthn:reg:${userId}`;
  }
}

/** Login ceremonies key the challenge by the single-use mfa token's jti. */
export function passkeyLoginChallengeKey(jti: string): string {
  return `webauthn:login:${jti}`;
}

function mfaIsRequired(
  subject: {
    readonly localPasswordHash: string | null;
    readonly entraObjectId: string | null;
    readonly roleKeys: readonly string[];
  },
  policy: AccountSecurityPolicy,
): boolean {
  if (subject.localPasswordHash === null || subject.entraObjectId !== null) return false;
  if (subject.roleKeys.includes(authenticationConstants.superAdminRoleKey)) return true;
  return policy.mfaRequiredForAdmins && subject.roleKeys.includes('ADMIN');
}

/** A fresh ArrayBuffer-backed copy: the library pins `Uint8Array<ArrayBuffer>`. */
function utf8Bytes(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
}

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const decoded = Buffer.from(value, 'base64url');
  const copy = new Uint8Array(new ArrayBuffer(decoded.byteLength));
  copy.set(decoded);
  return copy;
}

function parseTransports(stored: string | null): AuthenticatorTransport[] | undefined {
  if (stored === null || stored.length === 0) return undefined;
  return stored
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0) as AuthenticatorTransport[];
}
