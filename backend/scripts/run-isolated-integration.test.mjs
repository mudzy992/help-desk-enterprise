import assert from "node:assert/strict";
import { test } from "node:test";
import { URL } from "node:url";
import { buildDatabaseName, integrationSpecs, withDatabaseName } from "./run-isolated-integration.mjs";

test("svaki real-DB suite dobija kratko i sigurno ime baze", () => {
  assert.ok(integrationSpecs.includes("src/common/principal-context/role-assignment-analyzer.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/principal-context/user-role-constraint-migration.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/idempotency/request-idempotency.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/common/outbox/transactional-outbox.integration.spec.ts"));
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
  assert.ok(integrationSpecs.includes("src/modules/audit-log/partitioned-audit-chain.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/audit-log/audit-scope-provenance.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/security/step-up-policy.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-scope-display.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-license-assignment-scope.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-version-cas.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-relations-concurrency.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-unique-attributes.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-ticket-primary-invariant.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/directory/asset-directory-sync-lease.integration.spec.ts"));
  assert.ok(integrationSpecs.includes("src/modules/assets/asset-scheduler-reconciliation.integration.spec.ts"));
  const names = integrationSpecs.map((spec, index) => buildDatabaseName(index + 1, spec));
  assert.equal(new Set(names).size, integrationSpecs.length);
  for (const name of names) {
    assert.match(name, /^[a-z0-9_]+$/u);
    assert.ok(name.length <= 63);
  }
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
