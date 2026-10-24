import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMigrationEnvironment } from "./run-release-migrations.mjs";

test("zahtijeva odvojen migrator credential", () => {
  assert.throws(() => validateMigrationEnvironment({}), /MIGRATION_DATABASE_URL/);
  assert.throws(() => validateMigrationEnvironment({
    MIGRATION_DATABASE_URL: "postgresql://same:p@db/app",
    DATABASE_URL: "postgresql://same:other@db/app",
  }), /must be distinct/);
  assert.equal(validateMigrationEnvironment({
    MIGRATION_DATABASE_URL: "postgresql://migrator:p@db/app",
    DATABASE_URL: "postgresql://runtime:p@db/app",
  }), "postgresql://migrator:p@db/app");
});

test("production migrator zahtijeva verify-full TLS", () => {
  assert.throws(() => validateMigrationEnvironment({
    NODE_ENV: "production",
    MIGRATION_DATABASE_URL: "postgresql://migrator:p@db/app",
  }), /sslmode=verify-full/);
  assert.doesNotThrow(() => validateMigrationEnvironment({
    NODE_ENV: "production",
    MIGRATION_DATABASE_URL: "postgresql://migrator:p@db/app?sslmode=verify-full",
  }));
});
