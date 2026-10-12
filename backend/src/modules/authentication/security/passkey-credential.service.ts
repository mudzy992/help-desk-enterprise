import { Injectable, Logger } from '@nestjs/common';
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

/** Paket 5.4.0-e: the label stays a label — short, trimmed, never empty. */
export const passkeyDeviceNameMaxLength = 60;

/*
  Review 2026-10-12 (5.4.0-e, live test): `@simplewebauthn` defaults the ceremony
  timeout to **60 seconds**, and a browser aborts the request when it expires.
  That is enough for a platform authenticator (Windows Hello / Touch ID), but a
  cross-device QR flow (scan the code, unlock the phone, biometrics, save) is
  slower than that — the desktop gave up mid-flow and the phone reported a
  generic error while the authenticator had already done its part. The browser
  window is now explicit and always short enough to end before the server-side
  challenge expires, so a slow ceremony fails cleanly and a retry starts fresh.
*/
export const webauthnCeremonyTimeoutMilliseconds = 150_000;

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
  /*
    Review 2026-10-12 (5.4.0-e, live test): the verification errors were swallowed
    completely, so a refused ceremony left an administrator with no clue. The
    library's message names the expectation that did not hold (origin, RP ID,
    challenge, counter) and contains no credential material — it is the fastest
    way to spot a deployment whose frontend origin and `CORS_ORIGIN`/
    `WEBAUTHN_RP_ID` disagree.
  */
  private readonly logger = new Logger(PasskeyCredentialService.name);

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
      timeout: webauthnCeremonyTimeoutMilliseconds,
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
    }).catch((error: unknown) => {
      // Review 2026-10-12: a refused attestation is not a mistyped code. It used
      // to answer `MFA_INVALID_CODE` (401), which the web client read as "your
      // session ended" and signed the person out. It is a 400 with its own code,
      // so the dialog can explain what to check and the session is untouched.
      this.logger.warn(
        `passkey registration refused for user ${subject.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new AccountSecurityError('PASSKEY_VERIFICATION_FAILED');
    });
    if (!verification.verified || verification.registrationInfo === undefined) {
      throw new AccountSecurityError('PASSKEY_VERIFICATION_FAILED');
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
      timeout: webauthnCeremonyTimeoutMilliseconds,
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
    }).catch((error: unknown) => {
      // Login and step-up keep answering `MFA_INVALID_CODE` (an assertion is a
      // confirmation of a sign-in, and no session is on the line), but a silent
      // refusal is undebuggable on a self-hosted install — the message names the
      // expectation that failed and never carries credential material.
      this.logger.warn(
        `passkey assertion refused for user ${userId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
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

  /**
   * Paket 5.4.0-e: the profile list lets the owner name a credential ("Laptop
   * — Windows Hello"). Only the label changes: the WebAuthn id, the counter and
   * the backup flag are untouched, so a rename can never weaken the factor. The
   * row must belong to the caller.
   */
  async renameCredential(
    userId: string,
    credentialRowId: string,
    deviceName: string,
  ): Promise<PasskeyView> {
    const trimmed = deviceName.trim();
    if (trimmed.length === 0 || trimmed.length > passkeyDeviceNameMaxLength) {
      throw new AccountSecurityError('PASSKEY_INVALID_NAME', []);
    }
    const owned = await this.prisma.userPasskeyCredential.findFirst({
      where: { id: credentialRowId, userId },
      select: { id: true },
    });
    if (owned === null) throw new AccountSecurityError('PASSKEY_NOT_FOUND');
    const row = await this.prisma.userPasskeyCredential.update({
      where: { id: credentialRowId },
      data: { deviceName: trimmed },
      select: {
        id: true,
        deviceName: true,
        aaguid: true,
        createdAt: true,
        lastUsedAt: true,
        isBackedUp: true,
      },
    });
    return {
      id: row.id,
      deviceName: row.deviceName,
      aaguid: row.aaguid,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      isBackedUp: row.isBackedUp,
    };
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
