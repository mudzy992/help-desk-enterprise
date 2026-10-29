import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('UserRole repair and constraint migration (integration)', () => {
  it('repairs dirty assignments, enforces constraints, and rolls the whole migration back atomically', async () => {
    const pool = new Pool({ connectionString: url! });
    const client = await pool.connect();
    const schema = `it_role_repair_${Date.now()}`;
    const migration = await readFile(
      resolve(process.cwd(), 'prisma/migrations/20271013140000_user_role_scope_constraints/migration.sql'),
      'utf8',
    );
    try {
      await client.query('BEGIN');
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query('CREATE TABLE "Role" ("id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE)');
      await client.query(`CREATE TABLE "UserRole" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "roleId" TEXT NOT NULL,
        "organizationalUnitId" TEXT,
        "serviceId" TEXT
      )`);
      await client.query("INSERT INTO \"Role\" (\"id\", \"key\") VALUES ('r-admin', 'SUPER_ADMIN'), ('r-agent', 'AGENT')");
      await client.query(`INSERT INTO "UserRole"
        ("id", "userId", "roleId", "organizationalUnitId", "serviceId") VALUES
        ('01-ambiguous', 'u1', 'r-agent', 'ou1', 'svc1'),
        ('02-global-retained', 'u2', 'r-agent', NULL, NULL),
        ('03-global-duplicate', 'u2', 'r-agent', NULL, NULL),
        ('04-sa-retained', 'u3', 'r-admin', 'ou1', NULL),
        ('05-sa-duplicate', 'u3', 'r-admin', NULL, 'svc1')`);

      await client.query(migration);
      const repaired = await client.query<{ id: string; organizationalUnitId: string | null; serviceId: string | null }>(
        'SELECT "id", "organizationalUnitId", "serviceId" FROM "UserRole" ORDER BY "id"',
      );
      expect(repaired.rows).toEqual([
        { id: '02-global-retained', organizationalUnitId: null, serviceId: null },
        { id: '04-sa-retained', organizationalUnitId: null, serviceId: null },
      ]);
      await expect(
        client.query("INSERT INTO \"UserRole\" VALUES ('dual', 'u4', 'r-agent', 'ou1', 'svc1')"),
      ).rejects.toMatchObject({ code: '23514' });
      await client.query('ROLLBACK');
      const namespace = await client.query('SELECT to_regnamespace($1) AS name', [schema]);
      expect(namespace.rows[0]?.name).toBeNull();
    } finally {
      // ROLLBACK is harmless when the expected constraint error already aborted
      // the transaction and also protects cleanup if an assertion fails early.
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  });
});
