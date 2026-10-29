import { runBoundedTicketAutomation } from "./run-bounded-ticket-automation";

describe("runBoundedTicketAutomation", () => {
  it("uses bounded cursor pages and isolates a poison ticket", async () => {
    const source = Array.from({ length: 10_000 }, (_, index) => ({
      id: String(index).padStart(5, "0"),
    }));
    const fetchSizes: number[] = [];
    const errors: string[] = [];
    const result = await runBoundedTicketAutomation({
      batchSize: 17,
      runBudget: 100,
      fetchPage: async (cursor, take) => {
        fetchSizes.push(take);
        const start =
          cursor === undefined
            ? 0
            : source.findIndex((item) => item.id === cursor) + 1;
        return source.slice(start, start + take);
      },
      process: async (item) => {
        if (item.id === "00042") throw new Error("poison");
        return item.id;
      },
      onError: (_error, item) => errors.push(item.id),
    });
    expect(result).toHaveLength(99);
    expect(errors).toEqual(["00042"]);
    expect(fetchSizes.every((size) => size <= 17)).toBe(true);
    expect(result).toContain("00099");
    expect(result).not.toContain("00100");
  });

  it("allows a following run to continue remaining eligible work", async () => {
    const pending = new Map(
      Array.from({ length: 23 }, (_, index) => [
        String(index).padStart(2, "0"),
        true,
      ]),
    );
    const run = () =>
      runBoundedTicketAutomation({
        batchSize: 4,
        runBudget: 10,
        fetchPage: async (cursor, take) =>
          [...pending.keys()]
            .filter((id) => cursor === undefined || id > cursor)
            .slice(0, take)
            .map((id) => ({ id })),
        process: async ({ id }) => {
          pending.delete(id);
          return id;
        },
      });
    expect(await run()).toHaveLength(10);
    expect(await run()).toHaveLength(10);
    expect(await run()).toHaveLength(3);
    expect(pending.size).toBe(0);
  });
});
