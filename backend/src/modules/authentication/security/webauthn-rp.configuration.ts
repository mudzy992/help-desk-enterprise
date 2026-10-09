import { defaultAppName } from '../../branding/branding.constants';

/*
  Paket 5.4.0-a (M1): where the Relying Party (this server) sits for WebAuthn.

  The RP ID must be a registrable suffix of the frontend origin the browser
  uses, and `expectedOrigin` must match it exactly, or the browser refuses the
  ceremony. Both come from the same env the CORS allowlist uses, so the two
  layers cannot drift; `WEBAUTHN_RP_ID` exists only for hosts where the API is
  served from a subdomain of the frontend origin.

  Kept free of I/O so the matrix is unit tested like the other configuration
  parsers in this codebase.
*/

export type WebAuthnRpConfiguration = {
  /** Registrable domain the credential is scoped to (e.g. `helpdesk.example`). */
  readonly rpID: string;
  /** Exact origin(s) allowed to perform ceremonies (e.g. `https://helpdesk.example`). */
  readonly expectedOrigins: readonly string[];
  /** Human-readable name baked into ceremonies and authenticator UIs. */
  readonly rpName: string;
};

export class WebAuthnConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebAuthnConfigurationError';
  }
}

/** First origin of `CORS_ORIGIN` is the primary frontend the browser talks to. */
export function parseWebAuthnRpConfiguration(
  env: {
    readonly CORS_ORIGIN?: string | null;
    readonly WEBAUTHN_RP_ID?: string | null;
    readonly WEBAUTHN_EXPECTED_ORIGIN?: string | null;
    readonly APP_NAME?: string | null;
  },
): WebAuthnRpConfiguration {
  const corsOrigin = env.CORS_ORIGIN?.trim() ?? '';
  if (corsOrigin.length === 0) {
    throw new WebAuthnConfigurationError(
      'CORS_ORIGIN is not set: WebAuthn needs the frontend origin to derive the RP ID',
    );
  }
  const primaryOrigin = corsOrigin
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)[0];
  if (primaryOrigin === undefined) {
    throw new WebAuthnConfigurationError('CORS_ORIGIN contains no usable origin');
  }

  let expectedOrigins: string[];
  const explicitOrigins = env.WEBAUTHN_EXPECTED_ORIGIN?.trim() ?? '';
  if (explicitOrigins.length > 0) {
    expectedOrigins = explicitOrigins
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  } else {
    expectedOrigins = [primaryOrigin];
  }
  for (const origin of expectedOrigins) {
    if (!/^https?:\/\//.test(origin)) {
      throw new WebAuthnConfigurationError(
        `WebAuthn expected origin must start with http(s)://, got: ${origin}`,
      );
    }
  }

  const rpID =
    env.WEBAUTHN_RP_ID?.trim() ||
    hostnameOf(expectedOrigins[0]) ||
    '';
  if (rpID.length === 0) {
    throw new WebAuthnConfigurationError(
      'Could not derive the WebAuthn RP ID from the expected origin; set WEBAUTHN_RP_ID',
    );
  }

  return {
    rpID,
    expectedOrigins,
    rpName: env.APP_NAME?.trim() || defaultAppName,
  };
}

function hostnameOf(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}
