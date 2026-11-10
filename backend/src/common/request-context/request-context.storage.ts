import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContextStore = {
  readonly requestId: string;
  /** In-flight values shared by guards and services for this request only. */
  readonly memoizedPromises: Map<object, Map<string, Promise<unknown>>>;
};

export const requestContextStorage =
  new AsyncLocalStorage<RequestContextStore>();

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

/**
 * Shares an asynchronous read within one HTTP request, while leaving worker,
 * startup and script calls uncached. Failed reads are removed so a later call
 * in the same request can retry rather than inheriting a rejected promise.
 */
export function memoizeRequestPromise<T>(
  namespace: object,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const store = requestContextStorage.getStore();
  if (store === undefined) {
    return load();
  }

  let namespaceValues = store.memoizedPromises.get(namespace);
  if (namespaceValues === undefined) {
    namespaceValues = new Map();
    store.memoizedPromises.set(namespace, namespaceValues);
  }
  const cached = namespaceValues.get(key);
  if (cached !== undefined) {
    return cached as Promise<T>;
  }

  const pending = Promise.resolve().then(load);
  namespaceValues.set(key, pending);
  void pending.catch(() => {
    if (namespaceValues?.get(key) === pending) {
      namespaceValues.delete(key);
    }
  });
  return pending;
}

export function runWithRequestId<T>(requestId: string, callback: () => T): T {
  return requestContextStorage.run(
    { requestId, memoizedPromises: new Map() },
    callback,
  );
}
