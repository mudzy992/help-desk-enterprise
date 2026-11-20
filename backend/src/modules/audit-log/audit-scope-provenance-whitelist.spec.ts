import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { auditActionScopeRegistry } from './audit-action-scope-registry';
import { auditLogActions } from './audit-log.constants';

/*
  BA-problems-20 (P2), closed by W7.38: the database kept its own whitelist of
  actions whose organizational unit must equal the entity's own unit, and that
  list drifted from the code — `problem.updated` and `problem.claimed` were
  entity-scoped in `auditActionScopeRegistry` but unknown to the trigger, so
  their scope was only correct by construction.

  This spec reads the migrations, extracts the definition of
  `enforce_audit_scope_provenance` that is in force today, and compares it with
  the registry, so the next action that is declared entity-scoped cannot reach
  production without its database counterpart.
*/
const migrationRoot = path.resolve(__dirname, '../../../prisma/migrations');

/** The column each entity prefix has to be checked against. */
const canonicalColumns: Readonly<Record<string, { readonly table: string; readonly column: string }>> = {
  ticket: { table: 'Ticket', column: 'originUnitId' },
  group: { table: 'Group', column: 'organizationalUnitId' },
  organizational_unit: { table: 'OrganizationalUnit', column: 'id' },
  problem: { table: 'Problem', column: 'organizationalUnitId' },
  change: { table: 'ChangeRequest', column: 'organizationalUnitId' },
  asset: { table: 'Asset', column: 'organizationalUnitId' },
};

/**
 * Actions are namespaced either with a dot (`problem.updated`) or with an
 * underscore (`ticket_confidential_viewed`), so the entity is the longest
 * prefix that matches either separator.
 */
function entityOfAction(action: string): string | undefined {
  const prefixes = Object.keys(canonicalColumns).sort((left, right) => right.length - left.length);
  return prefixes.find(
    (prefix) => action === prefix || action.startsWith(`${prefix}.`) || action.startsWith(`${prefix}_`),
  );
}

const functionDefinition = /CREATE OR REPLACE FUNCTION "enforce_audit_scope_provenance"\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/u;
const whitelistBranch =
  /(?:IF|ELSIF)\s+NEW\."action"\s+IN\s*\(([\s\S]*?)\)\s*THEN\s*SELECT\s+"([A-Za-z_]+)"\s+INTO\s+canonical_scope\s+FROM\s+"([A-Za-z_]+)"/gu;

function migrations(): readonly { readonly name: string; readonly sql: string }[] {
  return readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(migrationRoot, name, 'migration.sql'), 'utf8') }));
}

/** The last definition in migration order is the one the database runs. */
function effectiveDefinition(): { readonly migration: string; readonly body: string } {
  const definitions = migrations()
    .map((migration) => ({ migration: migration.name, match: functionDefinition.exec(migration.sql) }))
    .filter((entry) => entry.match !== null);
  const last = definitions.at(-1);
  if (last === undefined || last.match === null) throw new Error('enforce_audit_scope_provenance is not defined by any migration');
  return { migration: last.migration, body: last.match[1] ?? '' };
}

function parsedWhitelist(): Map<string, { table: string; column: string }[]> {
  const whitelist = new Map<string, { table: string; column: string }[]>();
  for (const branch of effectiveDefinition().body.matchAll(whitelistBranch)) {
    const [, actionList = '', column = '', table = ''] = branch;
    for (const quoted of actionList.matchAll(/'([^']+)'/gu)) {
      const action = quoted[1] ?? '';
      const targets = whitelist.get(action) ?? [];
      targets.push({ table, column });
      whitelist.set(action, targets);
    }
  }
  return whitelist;
}

describe('audit scope provenance whitelist (BA-problems-20)', () => {
  it('checks exactly the table and column the entity prefix owns', () => {
    for (const entry of Object.values(canonicalColumns)) {
      expect(entry.table.length).toBeGreaterThan(0);
      expect(entry.column.length).toBeGreaterThan(0);
    }
  });

  it('enforces every entity-scoped action the code declares', () => {
    const whitelist = parsedWhitelist();
    const entityScoped = Object.entries(auditActionScopeRegistry).filter(([, policy]) => policy === 'entity');
    expect(entityScoped.length).toBeGreaterThan(0);
    for (const [action] of entityScoped) {
      const entity = entityOfAction(action);
      const expected = entity === undefined ? undefined : canonicalColumns[entity];
      expect({ action, expected }).toEqual({ action, expected: expect.anything() });
      expect({ action, checkedAgainst: whitelist.get(action) }).toEqual({
        action,
        checkedAgainst: [expected],
      });
    }
  });

  it('carries no stale action the code no longer treats as entity-scoped', () => {
    for (const action of parsedWhitelist().keys()) {
      expect({ action, policy: auditActionScopeRegistry[action] }).toEqual({ action, policy: 'entity' });
    }
  });

  it('checks each action once, against one table and column', () => {
    for (const [action, targets] of parsedWhitelist()) {
      expect({ action, count: targets.length }).toEqual({ action, count: 1 });
    }
  });

  it('keeps the trigger bound to the current definition', () => {
    const sql = migrations().map((migration) => migration.sql).join('\n');
    expect(sql).toContain('CREATE TRIGGER "AuditLog_scope_provenance"');
    expect(sql).toContain('BEFORE INSERT ON "AuditLog"');
    expect(sql).not.toContain('DROP TRIGGER "AuditLog_scope_provenance"');
  });

  it('covers the two actions W7.67 added for change edit and claim', () => {
    const whitelist = parsedWhitelist();
    expect(whitelist.get(auditLogActions.changeUpdated)).toEqual([
      { table: 'ChangeRequest', column: 'organizationalUnitId' },
    ]);
    expect(whitelist.get(auditLogActions.changeClaimed)).toEqual([
      { table: 'ChangeRequest', column: 'organizationalUnitId' },
    ]);
  });

  it('covers the two actions W7.30 added and W7.38 wired up', () => {
    const whitelist = parsedWhitelist();
    expect(whitelist.get(auditLogActions.problemUpdated)).toEqual([
      { table: 'Problem', column: 'organizationalUnitId' },
    ]);
    expect(whitelist.get(auditLogActions.problemClaimed)).toEqual([
      { table: 'Problem', column: 'organizationalUnitId' },
    ]);
  });
});
