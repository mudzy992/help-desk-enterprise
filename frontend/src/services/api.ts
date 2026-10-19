import { installTokenHeaders } from "@/lib/install/install-token-store";
import { readStoredSession } from "@/services/session-store";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

/**
 * An expired/revoked session used to surface as a
 * separate "not authorized" error on every screen. A 401 on an authenticated
 * request now calls this handler once (registered by the session module), which
 * clears the session and sends the user to sign in.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

const sessionlessPaths = [
  "/auth/login",
  "/auth/change-password",
  "/auth/entra",
  "/auth/logout",
  "/auth/providers",
  "/install/",
];

/**
 * on these paths a 401 is an *answer to
 * The action*, not "your session ended". The second factor accepts only a
 * correct TOTP/recovery code or a verified passkey assertion, and a rejected
 * one answers 401 (`MFA_INVALID_CODE`, `IDENTITY_CONFIRMATION_FAILED`). Treating
 * that as a lost session signed the person out in the middle of the very dialog
 * that was supposed to explain the failure — a mistyped code or a passkey the
 * server refused must only fail the dialog. Everything else still expires the
 * session exactly as before.
 */
const confirmationPaths = [
  "/auth/security/mfa/",
  "/auth/security/passkey/register/confirm",
  "/security/identity/passkey/",
  "/security/rate-limits",
  "/security/bulk-password-reset",
];

/** True when a 401 from `path` must leave the session alone. */
export function isConfirmationUnauthorizedPath(path: string): boolean {
  return [...sessionlessPaths, ...confirmationPaths].some((prefix) => path.startsWith(prefix));
}

function notifyUnauthorized(path: string, sentSession: boolean, status: number): void {
  if (status !== 401 || !sentSession || unauthorizedHandler === null) {
    return;
  }
  if (isConfirmationUnauthorizedPath(path)) {
    return;
  }
  unauthorizedHandler();
}

function overridesAuthorization(headers: HeadersInit | undefined): boolean {
  if (headers === undefined) return false;
  return new Headers(headers).has("Authorization");
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null = null,
    /** Structured details (e.g. password policy violations). */
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiErrorPayload = {
  code?: string;
  message?: string;
  requestId?: string;
  details?: Record<string, unknown>;
};

async function readApiError(response: Response): Promise<ApiError> {
  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  return new ApiError(
    response.status,
    payload?.code ?? "REQUEST_FAILED",
    payload?.message ?? "Request failed",
    payload?.requestId ?? null,
    payload?.details && typeof payload.details === "object" ? payload.details : null,
  );
}

/*
  One place for the rules every request follows: the session cookie travels with
  every call (`credentials: "include"`), the install token goes on `/install/`
  paths, a caller-supplied Authorization header is passed through unchanged, and
  a 401 is judged by the same exemption lists. The browser never handles the
  session token itself.
*/
async function sendRequest(path: string, init: RequestInit, accept: string): Promise<Response> {
  const sentSession = readStoredSession() !== null && !overridesAuthorization(init.headers);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: accept,
      ...installTokenHeaders(path),
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    notifyUnauthorized(path, sentSession, response.status);
    throw await readApiError(response);
  }
  return response;
}

async function authenticatedApiResponse(path: string, init: RequestInit): Promise<Response> {
  return sendRequest(path, init, "application/json");
}

async function readApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }
  // A 200 with an empty body (e.g. a Nest handler returning void) is a
  // success, not a parse failure; reading it as JSON used to throw and the
  // caller reported a "network" error although the change was saved.
  const text = await response.text();
  if (text.trim().length === 0) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/** Body plus response headers for endpoints that return pagination metadata. */
export async function apiRequestWithHeaders<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ readonly data: T; readonly headers: Headers }> {
  const response = await authenticatedApiResponse(path, init);
  return { data: await readApiResponse<T>(response), headers: response.headers };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await apiRequestWithHeaders<T>(path, init)).data;
}

export async function apiBlobRequest(path: string, init: RequestInit = {}): Promise<Blob> {
  const downloaded = await apiDownloadRequest(path, init);
  return downloaded.blob;
}

export type ApiDownloadResult = {
  readonly blob: Blob;
  readonly fileName: string | null;
};

export async function apiDownloadRequest(
  path: string,
  init: RequestInit = {},
): Promise<ApiDownloadResult> {
  const response = await sendRequest(path, init, "*/*");
  return {
    blob: await response.blob(),
    fileName: readContentDispositionFileName(response.headers.get("Content-Disposition")),
  };
}

function readContentDispositionFileName(header: string | null): string | null {
  if (header === null || header.length === 0) {
    return null;
  }
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utfMatch?.[1] !== undefined) {
    return decodeURIComponent(utfMatch[1].trim());
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  return plainMatch?.[1]?.trim() ?? null;
}
