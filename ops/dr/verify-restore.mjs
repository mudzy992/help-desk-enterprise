#!/usr/bin/env node
/*
  Paket 1.8 (A6) — četiri provjere iz RAW §860 nakon restore-a:
    1. login              POST /auth/login
    2. kreiranje tiketa   POST /tickets            (preskače se sa --dry)
    3. stari prilog       GET  /tickets/:id/attachments/:aid/content (fajl iz backupa)
    4. audit export       GET  /audit-logs/export?organizationalUnitId=…&format=csv

  Varijable: API_URL, ADMIN_EMAIL, ADMIN_PASSWORD (obavezno);
             ATTACHMENT_TICKET_ID, ATTACHMENT_ID, AUDIT_OU_ID (ispisuje restore-drill.sh);
             SERVICE_ID (opcionalno; inače prva aktivna usluga);
             RESTORE_STARTED_AT (ISO, opcionalno — za mjerenje prema RTO ≤ 4 h).
  Izlaz: tabela PASS/FAIL + JSON (--json=putanja) za zapisnik drilla.
  Node 20+ (globalni fetch). Lozinka se čita samo iz env-a.
*/
import { writeFileSync } from "node:fs";

const args = new Set(process.argv.slice(2).filter((a) => !a.startsWith("--json=")));
const jsonPath = process.argv.slice(2).find((a) => a.startsWith("--json="))?.slice(7) ?? null;
const dry = args.has("--dry");
const env = process.env;
const api = (env.API_URL ?? "").replace(/\/$/, "");
if (!api || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
  console.error("Potrebno: API_URL, ADMIN_EMAIL, ADMIN_PASSWORD");
  process.exit(2);
}

const results = [];
let token = null;
const startedAt = Date.now();

async function call(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(`${api}${path}`, { ...init, headers });
  return response;
}

async function check(name, run) {
  const t0 = Date.now();
  try {
    const detail = await run();
    results.push({ name, status: detail === "SKIP" ? "SKIP" : "PASS", ms: Date.now() - t0, detail: detail === "SKIP" ? "--dry" : detail });
  } catch (error) {
    results.push({ name, status: "FAIL", ms: Date.now() - t0, detail: String(error?.message ?? error) });
  }
}

await check("login", async () => {
  const response = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (!body.accessToken) throw new Error("nalog traži promjenu lozinke ili nema tokena");
  token = body.accessToken;
  return `principal ${body.principal?.subjectId ?? "?"}`;
});

await check("create_ticket", async () => {
  if (dry) return "SKIP";
  let serviceId = env.SERVICE_ID;
  if (!serviceId) {
    const response = await call("/services");
    if (!response.ok) throw new Error(`GET /services HTTP ${response.status}`);
    const services = await response.json();
    serviceId = (Array.isArray(services) ? services : services.items ?? [])[0]?.id;
    if (!serviceId) throw new Error("nema usluge; postavite SERVICE_ID");
  }
  const response = await call("/tickets", {
    method: "POST",
    body: JSON.stringify({
      title: `DR drill ${new Date().toISOString().slice(0, 10)}`,
      description: "Automatska provjera nakon restore-a (ops/dr/verify-restore.mjs).",
      impact: "LOW",
      urgency: "LOW",
      serviceId,
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const ticket = await response.json();
  return `tiket ${ticket.number ?? ticket.id}`;
});

await check("download_old_attachment", async () => {
  const { ATTACHMENT_TICKET_ID: ticketId, ATTACHMENT_ID: attachmentId } = env;
  if (!ticketId || !attachmentId) throw new Error("postavite ATTACHMENT_TICKET_ID i ATTACHMENT_ID");
  const response = await call(
    `/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}/content`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = (await response.arrayBuffer()).byteLength;
  if (bytes === 0) throw new Error("prazan fajl");
  return `${bytes} B`;
});

await check("audit_export", async () => {
  if (!env.AUDIT_OU_ID) throw new Error("postavite AUDIT_OU_ID");
  const response = await call(
    `/audit-logs/export?organizationalUnitId=${encodeURIComponent(env.AUDIT_OU_ID)}&format=csv`,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  return `${text.split("\n").filter(Boolean).length} redova`;
});

if (token) await call("/auth/logout", { method: "POST" }).catch(() => undefined);

const failed = results.filter((r) => r.status === "FAIL").length;
const restoreStart = env.RESTORE_STARTED_AT ? Date.parse(env.RESTORE_STARTED_AT) : NaN;
const rtoMinutes = Number.isFinite(restoreStart) ? Math.round((Date.now() - restoreStart) / 60000) : null;

console.log("\nDR verifikacija —", api, dry ? "(dry)" : "");
for (const r of results) {
  console.log(`  ${r.status.padEnd(4)}  ${r.name.padEnd(24)} ${String(r.ms).padStart(6)} ms  ${r.detail}`);
}
console.log(`\n  provjere: ${Date.now() - startedAt} ms` + (rtoMinutes === null ? "" : ` · od početka restore-a: ${rtoMinutes} min (RTO cilj ≤ 240)`));
console.log(failed === 0 ? "  REZULTAT: PASS\n" : `  REZULTAT: FAIL (${failed})\n`);

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify({ api, dry, at: new Date().toISOString(), rtoMinutes, results }, null, 2) + "\n");
}
process.exit(failed === 0 ? 0 : 1);
