import { readStoredSession } from "@/services/session-store";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function authorizationHeaders(): HeadersInit {
  const session = readStoredSession();
  if (session === null) {
    return {};
  }
  return { Authorization: `Bearer ${session.accessToken}` };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiErrorPayload = {
  code?: string;
  message?: string;
  requestId?: string;
};

async function readApiError(response: Response): Promise<ApiError> {
  const payload = (await response
    .json()
    .catch(() => null)) as ApiErrorPayload | null;
  return new ApiError(
    response.status,
    payload?.code ?? "REQUEST_FAILED",
    payload?.message ?? "Request failed",
    payload?.requestId ?? null,
  );
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...authorizationHeaders(),
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw await readApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiBlobRequest(
  path: string,
  init: RequestInit = {},
): Promise<Blob> {
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
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "*/*",
      ...authorizationHeaders(),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw await readApiError(response);
  }
  return {
    blob: await response.blob(),
    fileName: readContentDispositionFileName(
      response.headers.get("Content-Disposition"),
    ),
  };
}

function readContentDispositionFileName(
  header: string | null,
): string | null {
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
