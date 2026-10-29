export type LatestRequestGuard = {
  readonly begin: () => number;
  readonly isCurrent: (requestId: number) => boolean;
  readonly cancel: () => void;
};

/** Prevents an older async response from committing after a newer request. */
export function createLatestRequestGuard(): LatestRequestGuard {
  let current = 0;
  return {
    begin: () => ++current,
    isCurrent: (requestId) => requestId === current,
    cancel: () => {
      current += 1;
    },
  };
}
