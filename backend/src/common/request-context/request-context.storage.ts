import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextStore = {
  readonly requestId: string;
};

export const requestContextStorage =
  new AsyncLocalStorage<RequestContextStore>();

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

export function runWithRequestId<T>(requestId: string, callback: () => T): T {
  return requestContextStorage.run({ requestId }, callback);
}
