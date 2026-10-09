import { Injectable, Logger } from '@nestjs/common';
import {
  parseWebAuthnRpConfiguration,
  WebAuthnConfigurationError,
  type WebAuthnRpConfiguration,
} from './webauthn-rp.configuration';

/**
 * Paket 5.4.0-a (M1): resolves the WebAuthn RP configuration once. A missing
 * or invalid configuration does not take the whole authentication module
 * down — passkey endpoints answer `MFA_UNAVAILABLE` (503) and TOTP keeps
 * working, which the wave contract explicitly promises ("TOTP ostaje kao
 * fallback").
 */
@Injectable()
export class WebAuthnRpLoader {
  private readonly logger = new Logger(WebAuthnRpLoader.name);
  private cached: WebAuthnRpConfiguration | null | undefined;

  load(): WebAuthnRpConfiguration | null {
    if (this.cached !== undefined) return this.cached;
    try {
      this.cached = parseWebAuthnRpConfiguration(process.env);
    } catch (error) {
      this.cached = null;
      const message = error instanceof WebAuthnConfigurationError ? error.message : 'unknown error';
      this.logger.warn(`WebAuthn disabled: ${message}`);
    }
    return this.cached;
  }
}
