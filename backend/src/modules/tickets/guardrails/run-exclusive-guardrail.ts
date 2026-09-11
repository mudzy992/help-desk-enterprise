const chains = new Map<string, Promise<unknown>>();

export async function runExclusiveGuardrail<T>(
  subjectKey: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = chains.get(subjectKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => gate);
  chains.set(subjectKey, chained);
  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
    if (chains.get(subjectKey) === chained) {
      chains.delete(subjectKey);
    }
  }
}
