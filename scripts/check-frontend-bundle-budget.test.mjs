import assert from "node:assert/strict";
import test from "node:test";
import { budgets, collectStaticImports } from "./check-frontend-bundle-budget.mjs";

test("collectStaticImports follows static imports without pulling dynamic siblings", () => {
  const manifest = {
    "index.html": { file: "index.js", imports: ["shared.js"], dynamicImports: ["admin.js"] },
    "shared.js": { file: "shared.js" },
    "admin.js": { file: "admin.js" },
  };

  assert.deepEqual([...collectStaticImports(manifest, ["index.html"])], ["index.html", "shared.js"]);
});

test("route budgets preserve exactly five percent baseline headroom", () => {
  assert.equal(budgets.loginGzipBytes, Math.ceil(254_000 * 1.05));
  assert.equal(budgets.requesterDashboardGzipBytes, Math.ceil(261_000 * 1.05));
});

test("missing manifest imports fail closed", () => {
  assert.throws(
    () => collectStaticImports({ "index.html": { imports: ["missing.js"] } }, ["index.html"]),
    /Manifest entry is missing/,
  );
});
