import type { CDPSession, Page } from '@playwright/test';

/*
  Paket 5.4.0-f: a real WebAuthn ceremony without a real device.

  Chromium ships a WebAuthn *virtual authenticator* behind DevTools, and
  Playwright exposes DevTools through `page.context().newCDPSession(page)`. That
  is the only way to exercise the passkey code paths honestly: the browser
  builds a real attestation from the options the server sent (so the server-side
  checks for origin, RP ID, challenge, user handle and signature all run),
  `navigator.credentials.create/get` really executes, and the credential +
  private key live inside the authenticator exactly like on a security key.
  Nothing is mocked on either side.

  The defaults describe a **platform authenticator with a resident key and user
  verification** ("Windows Hello in software"): that is what the server asks for
  (`residentKey: 'preferred'`, `userVerification: 'preferred'`) and what a laptop
  with Touch ID / Windows Hello offers. `automaticPresenceSimulation` makes the
  user-presence test pass without a click, so a spec does not have to drive a
  browser dialog.

  The authenticator belongs to the **browser context**, so it lives exactly as
  long as one test's page: a passkey registered in one test cannot be asserted
  in the next. Specs that both register and sign in therefore do it in one test.
*/

export type VirtualAuthenticatorOptions = {
  readonly protocol: 'ctap2' | 'u2f';
  readonly transport: 'usb' | 'nfc' | 'ble' | 'cable' | 'hybrid' | 'smart-card' | 'internal';
  readonly hasResidentKey: boolean;
  readonly hasUserVerification: boolean;
  readonly isUserVerified: boolean;
  readonly automaticPresenceSimulation: boolean;
};

/** Touch ID / Windows Hello in software: resident key, UV always satisfied. */
export const platformAuthenticatorOptions: VirtualAuthenticatorOptions = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
};

/** One credential as the authenticator stores it (no private key is exposed). */
export type VirtualCredential = {
  readonly credentialId: string;
  readonly isResidentCredential: boolean;
  readonly rpId: string;
  readonly userHandle: string | null;
  readonly signCount: number;
};

export class VirtualAuthenticator {
  private constructor(
    private readonly session: CDPSession,
    readonly authenticatorId: string,
  ) {}

  /**
   * Adds the authenticator to the page's browser context. Chromium evaluates
   * `isUserVerifyingPlatformAuthenticatorAvailable()` against the environment
   * that is present when the document loads, so call this **before** the first
   * navigation of the test.
   */
  static async install(
    page: Page,
    options: VirtualAuthenticatorOptions = platformAuthenticatorOptions,
  ): Promise<VirtualAuthenticator> {
    const session = await page.context().newCDPSession(page);
    // `enableUI: false`: no DevTools WebAuthn tab, and — more importantly — the
    // ceremony is completed by the environment instead of waiting for a human.
    await session.send('WebAuthn.enable', { enableUI: false });
    const { authenticatorId } = await session.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: options.protocol,
        transport: options.transport,
        hasResidentKey: options.hasResidentKey,
        hasUserVerification: options.hasUserVerification,
      },
    });
    const authenticator = new VirtualAuthenticator(session, authenticatorId);
    await authenticator.setUserVerified(options.isUserVerified);
    await authenticator.setAutomaticPresenceSimulation(options.automaticPresenceSimulation);
    return authenticator;
  }

  /** What the authenticator currently holds — the proof a ceremony really ran. */
  async credentials(): Promise<readonly VirtualCredential[]> {
    const { credentials } = await this.session.send('WebAuthn.getCredentials', {
      authenticatorId: this.authenticatorId,
    });
    return credentials.map((credential) => ({
      credentialId: credential.credentialId,
      isResidentCredential: credential.isResidentCredential,
      rpId: credential.rpId ?? '',
      userHandle: credential.userHandle ?? null,
      signCount: credential.signCount,
    }));
  }

  /** The signature counter the authenticator reports (assertions must raise it). */
  async signCount(): Promise<number> {
    const [first] = await this.credentials();
    return first?.signCount ?? 0;
  }

  async setUserVerified(isUserVerified: boolean): Promise<void> {
    await this.session.send('WebAuthn.setUserVerified', {
      authenticatorId: this.authenticatorId,
      isUserVerified,
    });
  }

  async setAutomaticPresenceSimulation(enabled: boolean): Promise<void> {
    await this.session.send('WebAuthn.setAutomaticPresenceSimulation', {
      authenticatorId: this.authenticatorId,
      enabled,
    });
  }

  /**
   * Makes the next ceremony fail in the authenticator, so a spec can prove the
   * server refuses a bad signature instead of trusting a "verified" answer.
   */
  async setSignatureOverride(isBogusSignature: boolean): Promise<void> {
    await this.session.send('WebAuthn.setResponseOverrideBits', {
      authenticatorId: this.authenticatorId,
      isBogusSignature,
    });
  }

  async remove(): Promise<void> {
    await this.session.send('WebAuthn.removeVirtualAuthenticator', {
      authenticatorId: this.authenticatorId,
    });
    await this.session.detach().catch(() => undefined);
  }
}
