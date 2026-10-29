import type { ImapFlow } from 'imapflow';

/** Surfaces ImapFlow socket errors to await/catch instead of crashing the worker process. */
export function attachImapClientErrorGuard(client: ImapFlow): {
  readonly throwIfFailed: () => void;
  readonly detach: () => void;
} {
  let failure: Error | undefined;
  const onError = (error: Error) => {
    failure = error;
  };
  client.on('error', onError);
  return {
    throwIfFailed: () => {
      if (failure !== undefined) throw failure;
    },
    detach: () => {
      client.removeListener('error', onError);
    },
  };
}
