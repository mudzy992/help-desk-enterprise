export type OperationGuard = {
  run<T>(key: string, operation: () => Promise<T>): Promise<T | undefined>;
  isPending(key: string): boolean;
};

/** Synchronously reserves an operation before its first await. */
export function createOperationGuard(): OperationGuard {
  const pending = new Set<string>();
  return {
    isPending: (key) => pending.has(key),
    async run(key, operation) {
      if (pending.has(key)) return undefined;
      pending.add(key);
      try {
        return await operation();
      } finally {
        pending.delete(key);
      }
    },
  };
}
