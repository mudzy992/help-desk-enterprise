export const ticketAutomationBatchSize = 25;
export const ticketAutomationRunBudget = 100;

export async function runBoundedTicketAutomation<
  T extends { readonly id: string },
  R,
>(input: {
  readonly fetchPage: (
    cursor: string | undefined,
    take: number,
  ) => Promise<readonly T[]>;
  readonly process: (item: T) => Promise<R | null>;
  readonly batchSize?: number;
  readonly runBudget?: number;
  readonly onError?: (error: unknown, item: T) => void;
}): Promise<readonly R[]> {
  const batchSize = bound(input.batchSize ?? ticketAutomationBatchSize, 1, 100);
  const runBudget = bound(
    input.runBudget ?? ticketAutomationRunBudget,
    1,
    1_000,
  );
  const results: R[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  while (scanned < runBudget) {
    const page = await input.fetchPage(
      cursor,
      Math.min(batchSize, runBudget - scanned),
    );
    if (page.length === 0) break;
    for (const item of page) {
      cursor = item.id;
      scanned += 1;
      try {
        const result = await input.process(item);
        if (result !== null) results.push(result);
      } catch (error) {
        input.onError?.(error, item);
      }
    }
    if (page.length < batchSize) break;
  }
  return results;
}

function bound(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}
