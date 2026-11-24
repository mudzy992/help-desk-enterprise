import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ApiClient } from "../helpers/api-client";
import {
  createOfferedService,
  createTicketViaApi,
} from "../helpers/create-ticket";
import { readE2EEnvironment } from "../helpers/environment";
import { signIn } from "../helpers/sign-in";

type UnitNode = { readonly id: string; readonly name: string };
type GroupListItem = {
  readonly id: string;
  readonly name: string;
  readonly organizationalUnitId: string;
};
type TicketView = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly forwardCount: number;
};
type Preview = {
  readonly columns: string[];
  readonly rows: Array<Record<string, string | number | null>>;
  readonly totalRows: number;
};
type AuditRow = {
  readonly action: string;
  readonly metadata: Record<string, unknown>;
};

/**
 * Package 1.6: a ticket forwarded three times shows the list indicator, is found
 * by the "forwarded" filter and appears in the ping-pong pack; the reports page
 * previews a pack and downloads a CSV (BOM, headers) that lands in the audit.
 */
test.describe("12 report packs and forward tracking", () => {
  test("ping-pong → indicator/filter → pack preview → CSV download → audit", async ({
    page,
  }) => {
    const env = readE2EEnvironment();
    const api = new ApiClient();
    await api.login(env.superAdminEmail, env.superAdminPassword);
    const tree = await api.requestJson<UnitNode | UnitNode[]>(
      "/organizational-units/tree",
    );
    const root = (Array.isArray(tree) ? tree : [tree])[0];
    const groupA = await ensureGroup(api, "E2E PingPong A", root.id);
    const groupB = await ensureGroup(api, "E2E PingPong B", root.id);

    const service = await createOfferedService(api, { label: "PingPong" });
    const userApi = new ApiClient();
    await userApi.login(env.userEmail, env.userPassword);
    const title = `E2E ping-pong ${Date.now()}`;
    const created = await createTicketViaApi(userApi, {
      title,
      serviceId: service.id,
      originUnitId: root.id,
    });
    for (const targetGroupId of [groupA, groupB, groupA]) {
      await api.requestJson(`/tickets/${created.id}/forward`, {
        method: "POST",
        body: JSON.stringify({
          targetGroupId,
          reason: "E2E: ping-pong provjera",
        }),
      });
    }
    const ticket = await api.requestJson<TicketView>(`/tickets/${created.id}`);
    expect(ticket.forwardCount).toBe(3);

    const scope = new URLSearchParams({
      organizationalUnitId: root.id,
      from: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      to: new Date(Date.now() + 60 * 1000).toISOString(),
    });
    const pingPong = await api.requestJson<Preview>(
      `/reports/packs/forward-ping-pong/preview?${scope.toString()}`,
    );
    const row = pingPong.rows.find(
      (item) => item.ticketNumber === ticket.ticketNumber,
    );
    expect(row).toMatchObject({ forwardsInPeriod: 3 });

    // W7.108 (`BA-reports-18`): the preview is a read audit, not telemetry. The
    // row is checked right after its own request instead of at the end of the
    // test: the audit list is a newest-50 page shared with every other audit
    // writer in the installation (this one had 145 open tickets), so a row that
    // was written minutes — or a scan cycle — earlier can legitimately fall out
    // of the page and make an otherwise green run red (nightly 45376798360,
    // triage 45387603494: one preview row visible out of two).
    const apiPreviewAudit = await waitForAuditRow(api, root.id, (entry) =>
      entry.action === "report.pack.previewed" &&
      entry.metadata.pack === "forward_ping_pong",
      "preview audit for the API call (forward_ping_pong)",
    );
    expect(apiPreviewAudit.metadata).toMatchObject({
      pack: "forward_ping_pong",
      boundaries: "[from, to)",
    });

    await signIn(page, env.superAdminEmail, env.superAdminPassword);
    await page.goto(
      `/tickets?view=all&forwarded=any&q=${encodeURIComponent(title)}`,
    );
    await expect(page.getByTestId("ticket-list-forwarded")).toHaveValue("any");
    const listRow = page.getByRole("row", {
      name: new RegExp(ticket.ticketNumber),
    });
    await expect(listRow.getByTestId("ticket-forward-indicator")).toContainText(
      "3",
      {
        timeout: 20_000,
      },
    );

    await page.goto(`/tickets/${created.id}`);
    await expect(page.getByTestId("ticket-forward-chip")).toContainText("3");

    await page.goto("/reports?tab=packs");
    await page.getByTestId("report-pack-monthly-kpi").click();
    await page.getByTestId("report-pack-preview").click();
    await expect(page.getByTestId("report-pack-table")).toBeVisible({
      timeout: 20_000,
    });

    // The button is a real read of the same rows an export would return, so the
    // UI half is audited exactly like the API half — checked here, while the row
    // this click just wrote is still at the top of the page.
    const uiPreviewAudit = await waitForAuditRow(api, root.id, (entry) =>
      entry.action === "report.pack.previewed" &&
      entry.metadata.pack === "monthly_kpi",
      "preview audit for the UI button (monthly_kpi)",
    );
    expect(uiPreviewAudit.metadata).toMatchObject({
      pack: "monthly_kpi",
      boundaries: "[from, to)",
      windowMode: "mixed",
    });

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("report-pack-download-csv").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^report_monthly_kpi_.+\.csv$/,
    );
    const content = await readFile((await download.path())!, "utf8");
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain("createdCount");

    const exportEntry = await waitForAuditRow(api, root.id, (entry) =>
      entry.action === "reports.export",
      "export audit for the CSV download",
    );
    expect(exportEntry.metadata).toMatchObject({
      format: "csv",
      pack: "monthly_kpi",
    });
    expect(exportEntry.metadata.from).toBeDefined();
  });
});

/**
 * Waits for the audit row an action just wrote, inside the newest page of the
 * OU's audit journal.
 *
 * The list endpoint is a newest-50 page with no action filter, so the previous
 * version of this test asked one question ("are two preview rows still on the
 * first page after both previews?") that depended on everything else the
 * installation wrote in between. A busy night with 145 open tickets made that
 * false while the product was right. Asking per action, immediately after the
 * action, keeps the same guarantee (each preview and the export are audited)
 * without depending on unrelated journal traffic; the failure message names what
 * the page actually held, so a red run explains itself.
 */
async function waitForAuditRow(
  api: ApiClient,
  organizationalUnitId: string,
  matches: (entry: AuditRow) => boolean,
  description: string,
): Promise<AuditRow> {
  const deadline = Date.now() + 20_000;
  let seen: string[] = [];
  for (;;) {
    const page = await api.requestJson<{ items: AuditRow[] }>(
      `/audit-logs?organizationalUnitId=${organizationalUnitId}&take=50`,
    );
    seen = page.items.map((entry) =>
      entry.metadata.pack === undefined
        ? entry.action
        : `${entry.action}(${String(entry.metadata.pack)})`,
    );
    const hit = page.items.find(matches);
    if (hit !== undefined) {
      return hit;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `No ${description} within 20 s. Newest ${seen.length} audit entries: ${seen.join(", ") || "(none)"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function ensureGroup(
  api: ApiClient,
  name: string,
  organizationalUnitId: string,
): Promise<string> {
  const groups = await api.requestJson<GroupListItem[]>("/groups");
  const existing = groups.find(
    (group) =>
      group.name === name &&
      group.organizationalUnitId === organizationalUnitId,
  );
  if (existing !== undefined) {
    return existing.id;
  }
  const created = await api.requestJson<{ id: string }>("/groups", {
    method: "POST",
    body: JSON.stringify({ name, organizationalUnitId }),
  });
  return created.id;
}
