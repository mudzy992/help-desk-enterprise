import type { SignInContext } from './authentication.types';

/** Paket 2.1 (M6): IP (Express `trust proxy` resolved) and User-Agent. */
export function readSignInContext(
  request: { readonly ip?: string; readonly headers?: Record<string, string | string[] | undefined> } | undefined,
): SignInContext {
  const agent = request?.headers?.['user-agent'];
  return {
    ipAddress: request?.ip?.trim() || null,
    userAgent: (Array.isArray(agent) ? agent[0] : agent)?.trim() || null,
  };
}
