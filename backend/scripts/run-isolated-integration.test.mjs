import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { URL, fileURLToPath } from "node:url";
import { buildDatabaseName, integrationSpecs, withDatabaseName } from "./run-isolated-integration.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function discoverServiceCatalogIntegrationSpecs(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return discoverServiceCatalogIntegrationSpecs(file);
    if (!entry.isFile() || !entry.name.endsWith(".integration.spec.ts")) return [];
    return [path.relative(backendRoot, file).split(path.sep).join("/")];
  });
}

test("svaki real-DB suite dobija kratko i sigurno ime baze", () => {
  assert.ok(integrationSpecs.includes("src/common/principal-context/role-assignment-analyzer.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/principal-context/user-role-constraint-migration.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/idempotency/request-idempotency.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/outbox/transactional-outbox.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/changes/change-downtime-outbox.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/sla/sla-write-lock.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/sla/sla-compliance-aggregation.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/optimistic-concurrency/optimistic-concurrency.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/database-lock/database-lock.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/bulk-command/bulk-command.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/storage-write/storage-write.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/cache-invalidation/cache-invalidation.integration.spec.ts"));
  const requiredTicketEvidence = [
    "src/modules/tickets/ticket-message-command.integration.spec.ts",
    "src/modules/tickets/approvals/ticket-approval-concurrency.integration.spec.ts",
    "src/modules/tickets/attachments/attachment-lifecycle.integration.spec.ts",
    "src/modules/tickets/bulk/ticket-bulk-operation.integration.spec.ts",
    "src/modules/tickets/export/ticket-export-scope.integration.spec.ts",
    "src/modules/tickets/guardrails/guardrail-distributed-claim.integration.spec.ts",
    "src/modules/tickets/guardrails/guardrail-effect-transaction.integration.spec.ts",
    "src/modules/tickets/remote/remote-rate-limit.integration.spec.ts",
    "src/modules/tickets/reopen/reopen-same-ticket.integration.spec.ts",
    "src/modules/tickets/saved-views/saved-view-concurrency.integration.spec.ts",
    "src/modules/tickets/split/split-attachment-storage.integration.spec.ts",
    "src/modules/tickets/ticket-side-effect-outbox.integration.spec.ts",
  ];
  for (const spec of requiredTicketEvidence) assert.ok(integrationSpecs.includes(spec), `nedostaje obavezni ticket evidence shard: ${spec}`);
  assert.ok(integrationSpecs.includes("src/common/principal-context/principal-authority.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/authentication/session-revocation.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/authorization/evaluate-resource-policy.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/authorization/route-authorization-negative-matrix.integration.spec.ts"));
  assert.ok(
    integrationSpecs.includes("src/modules/routing/routing-critical-matrix.integration.spec.ts"),
    "nedostaje obavezni routing critical-matrix PostgreSQL shard",
  );
  assert.ok(
    integrationSpecs.includes(
      "src/modules/service-onboarding/service-onboarding-routing-coverage.integration.spec.ts",
    ),
    "nedostaje BA-routing-02 onboarding routing-coverage PostgreSQL shard",
  );
  assert.ok(
    integrationSpecs.includes("src/modules/service-catalog/service-catalog-optimistic-concurrency.integration.spec.ts"),
    "nedostaje obavezni BA-09 service-catalog optimistic-concurrency PostgreSQL shard",
  );
  assert.ok(
    integrationSpecs.includes("src/modules/service-catalog/service-catalog-pagination.integration.spec.ts"),
    "nedostaje obavezni BA-10 service-catalog PostgreSQL shard",
  );
  assert.ok(
    integrationSpecs.includes(
      "src/modules/service-catalog/service-downtime-window-overlap.integration.spec.ts",
    ),
    "nedostaje obavezni BA-07 downtime-overlap PostgreSQL shard",
  );
  assert.ok(
    integrationSpecs.includes(
      "src/modules/service-catalog/service-category-parent-race.integration.spec.ts",
    ),
    "nedostaje obavezni BA-08 category-parent PostgreSQL shard",
  );
  assert.ok(
    integrationSpecs.includes(
      "src/modules/service-catalog/service-form-version-immutability.integration.spec.ts",
    ),
    "nedostaje obavezni BA-01 form-version concurrency PostgreSQL shard",
  );
  assert.ok(
    integrationSpecs.includes(
      "src/modules/service-catalog/service-form-version-activation.integration.spec.ts",
    ),
    "nedostaje obavezni BA-05 concurrent form activation PostgreSQL shard",
  );
  assert.ok(
    integrationSpecs.includes(
      "src/modules/service-catalog/service-form-version-create.integration.spec.ts",
    ),
    "nedostaje obavezni BA-06 concurrent form-version create PostgreSQL shard",
  );
  assert.ok(
    integrationSpecs.includes(
      "src/modules/config-versioning/apply-catalog-snapshot.integration.spec.ts",
    ),
    "nedostaje obavezni BA-02 config catalog PostgreSQL shard",
  );
  assert.ok(integrationSpecs.includes("src/modules/audit-log/partitioned-audit-chain.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/audit-log/audit-scope-provenance.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/security/step-up-policy.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-scope-display.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-hard-delete.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-license-assignment-scope.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-version-cas.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-relations-concurrency.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-unique-attributes.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-import-apply.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-business-audit.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-operations-metrics.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/transfers/asset-transfer-template-version.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-ticket-primary-invariant.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/directory/asset-directory-sync-lease.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-scheduler-reconciliation.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/reminders/asset-reminder-email-delivery.integration.spec.ts"));
  const names = integrationSpecs.map((spec, index) => buildDatabaseName(index + 1, spec));
  assert.equal(new Set(names).size, integrationSpecs.length);
  for (const name of names) {
    assert.match(name, /^[a-z0-9_]+$/u);
    assert.ok(name.length <= 63);
  }
});

test("BA-templates-01 management-read PostgreSQL integration spec je registrovan za CI", () => {
  assert.ok(
    integrationSpecs.includes("src/modules/templates/management-read-scope.integration.spec.ts"),
    "nedostaje obavezni BA-templates-01 management-read scope PostgreSQL shard",
  );
});

test("BA-templates-07 playbook name uniqueness PostgreSQL integration spec je registrovan za CI", () => {
  assert.ok(
    integrationSpecs.includes("src/modules/templates/playbooks/playbook-name-uniqueness.integration.spec.ts"),
    "nedostaje BA-templates-07 playbook name uniqueness PostgreSQL shard",
  );
});

test("BA-templates-03 concurrent definition PostgreSQL integration spec je registrovan za CI", () => {
  assert.ok(
    integrationSpecs.includes(
      "src/modules/templates/playbooks/playbook-definition-concurrency.integration.spec.ts",
    ),
    "nedostaje obavezni BA-templates-03 playbook definition concurrency shard",
  );
});

test("BA-templates-04/10 checklist concurrency PostgreSQL spec je registrovan za CI", () => {
  assert.ok(
    integrationSpecs.includes(
      "src/modules/templates/ticket-playbooks/ticket-playbooks-concurrency.integration.spec.ts",
    ),
    "nedostaje obavezni BA-templates-04/10 checklist concurrency shard",
  );
});

test("BA-templates-05 auto-attach outbox PostgreSQL spec je registrovan za CI", () => {
  assert.ok(
    integrationSpecs.includes("src/modules/tickets/ticket-playbook-auto-attach.integration.spec.ts"),
    "nedostaje obavezni BA-templates-05 auto-attach recovery shard",
  );
});

test("BA-templates-06 config snapshot PostgreSQL spec je registrovan za CI", () => {
  assert.ok(
    integrationSpecs.includes("src/modules/config-versioning/apply-templates-snapshot.integration.spec.ts"),
    "nedostaje BA-templates-06 config snapshot shard",
  );
});

test("svaki service-catalog PostgreSQL integration spec je registrovan za CI", () => {
  const directory = path.join(backendRoot, "src/modules/service-catalog");
  const discovered = discoverServiceCatalogIntegrationSpecs(directory).sort();
  const registered = integrationSpecs
    .filter((spec) => spec.startsWith("src/modules/service-catalog/") && spec.endsWith(".integration.spec.ts"))
    .sort();
  assert.deepEqual(
    registered,
    discovered,
    "svaki service-catalog integration fajl mora biti izvršen u isolated PostgreSQL runneru",
  );
});

test("mijenja samo database pathname u URL-u", () => {
  const result = new URL(withDatabaseName(
    "postgresql://user:pass@127.0.0.1:5432/template?schema=public",
    "it_1_retention",
  ));
  assert.equal(result.pathname, "/it_1_retention");
  assert.equal(result.username, "user");
  assert.equal(result.password, "pass");
  assert.equal(result.searchParams.get("schema"), "public");
});

test("odbija database ime koje može postati SQL/URL injection", () => {
  assert.throws(
    () => withDatabaseName("postgresql://u:p@localhost/base", 'bad";DROP DATABASE base'),
    /nesigurno ime/u,
  );
});
