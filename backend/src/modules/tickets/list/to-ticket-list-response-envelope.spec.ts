import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toTicketListResponseEnvelope } from "./to-ticket-list-response-envelope";

type Fixture = {
  readonly ticketPage: {
    readonly items: readonly Record<string, unknown>[];
    readonly total: number;
    readonly totalIsCapped?: boolean;
    readonly totalsAsOf: number;
    readonly page: number;
    readonly pageSize: number;
  };
};

const fixture = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "..",
      "contracts",
      "fixtures",
      "critical-api-responses.json",
    ),
    "utf8",
  ),
) as Fixture;

describe("toTicketListResponseEnvelope", () => {
  it("matches the shared public ticket page fixture without dropping contract fields", () => {
    const page = fixture.ticketPage;
    expect(toTicketListResponseEnvelope(page, page.items)).toEqual(page);
    expect(page.items[0]).toMatchObject({ ticketNumber: "HD-44" });
    expect(page.totalsAsOf).toBe(1_792_659_600_000);
  });

  it("omits the optional capped marker when the count is exact", () => {
    expect(
      toTicketListResponseEnvelope(
        { total: 1, totalsAsOf: 1, page: 1, pageSize: 50 },
        [{ ticketNumber: "HD-1" }],
      ),
    ).toEqual({
      items: [{ ticketNumber: "HD-1" }],
      total: 1,
      totalsAsOf: 1,
      page: 1,
      pageSize: 50,
    });
  });
});
