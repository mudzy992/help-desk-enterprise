import type { IPublicClientApplication } from "@azure/msal-browser";
import type { AuthenticationProviders } from "@/services/auth-api";

/*
  Paket 1.8 (A1): Microsoft sign-in with the MSAL redirect flow.

  - MSAL is loaded lazily, so the local/break-glass login keeps its bundle.
  - The redirect URI is always `<origin>/auth/callback`; it must be registered
    in the Entra app registration as a "Single-page application" URI.
  - Only the ID token is used; the backend validates it (issuer, audience,
    signature via JWKS) and issues the normal application session.
  - The desired in-app path travels in the OIDC `state` and is validated to be
    a same-origin relative path before it is used (no open redirect).
*/

export type EntraClientConfiguration = NonNullable<AuthenticationProviders["entra"]>;

const CONFIGURATION_STORAGE_KEY = "ephd.entra.configuration";
export const ENTRA_CALLBACK_PATH = "/auth/callback";

let cached: { readonly key: string; readonly instance: Promise<IPublicClientApplication> } | null = null;

export function entraRedirectUri(): string {
  return `${window.location.origin}${ENTRA_CALLBACK_PATH}`;
}

/** Only in-app relative paths are accepted as the post-login target. */
export function safeReturnPath(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  if (value.startsWith(ENTRA_CALLBACK_PATH) || value.startsWith("/login")) {
    return "/";
  }
  return value;
}

export function rememberEntraConfiguration(configuration: EntraClientConfiguration): void {
  try {
    sessionStorage.setItem(CONFIGURATION_STORAGE_KEY, JSON.stringify(configuration));
  } catch {
    // Private mode without storage: the callback page re-reads /auth/providers.
  }
}

export function forgetEntraConfiguration(): void {
  try {
    sessionStorage.removeItem(CONFIGURATION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function readRememberedEntraConfiguration(): EntraClientConfiguration | null {
  try {
    const raw = sessionStorage.getItem(CONFIGURATION_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<EntraClientConfiguration>;
    if (typeof parsed.clientId !== "string" || typeof parsed.authority !== "string") {
      return null;
    }
    return {
      tenantId: String(parsed.tenantId ?? ""),
      clientId: parsed.clientId,
      authority: parsed.authority,
      singleLogout: parsed.singleLogout === true,
    };
  } catch {
    return null;
  }
}

export function getEntraClient(
  configuration: EntraClientConfiguration,
): Promise<IPublicClientApplication> {
  const key = `${configuration.authority}|${configuration.clientId}`;
  if (cached?.key === key) {
    return cached.instance;
  }
  const instance = import("@azure/msal-browser").then(async ({ PublicClientApplication }) => {
    const client = new PublicClientApplication({
      auth: {
        clientId: configuration.clientId,
        authority: configuration.authority,
        redirectUri: entraRedirectUri(),
        postLogoutRedirectUri: `${window.location.origin}/login`,
        navigateToLoginRequestUrl: false,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await client.initialize();
    return client;
  });
  cached = { key, instance };
  // A failed initialisation must not be cached forever.
  instance.catch(() => {
    if (cached?.instance === instance) cached = null;
  });
  return instance;
}

export async function startEntraSignIn(
  configuration: EntraClientConfiguration,
  returnPath: string,
): Promise<void> {
  rememberEntraConfiguration(configuration);
  const client = await getEntraClient(configuration);
  await client.loginRedirect({
    scopes: ["openid", "profile", "email"],
    prompt: "select_account",
    state: safeReturnPath(returnPath),
  });
}

export type EntraRedirectOutcome =
  | { readonly kind: "token"; readonly idToken: string; readonly returnPath: string }
  | { readonly kind: "none" };

/** Completes the redirect on `/auth/callback`. Throws MSAL errors as-is. */
export async function completeEntraRedirect(
  configuration: EntraClientConfiguration,
): Promise<EntraRedirectOutcome> {
  const client = await getEntraClient(configuration);
  const result = await client.handleRedirectPromise();
  if (result === null || result.idToken.length === 0) {
    return { kind: "none" };
  }
  return {
    kind: "token",
    idToken: result.idToken,
    returnPath: safeReturnPath(result.state),
  };
}

/** Optional single logout (setting `entraSingleLogout`). */
export async function signOutOfEntra(): Promise<void> {
  const configuration = readRememberedEntraConfiguration();
  if (configuration === null || !configuration.singleLogout) return;
  const client = await getEntraClient(configuration);
  await client.logoutRedirect({ postLogoutRedirectUri: `${window.location.origin}/login` });
}
