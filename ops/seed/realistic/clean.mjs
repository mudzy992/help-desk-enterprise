/** Tables that stay: accounts, directory, groups, settings, SLA šifrarnik, asset types. */
export const keepTables = new Set([
  'AppSetting',
  'AssetAttribute',
  'AssetType',
  'BusinessHoursCalendar',
  'CalendarHoliday',
  'ConfigVersion',
  'Group',
  'GroupMember',
  'ManualDirectoryGroup',
  'ManualDirectoryOrganizationalUnit',
  'ManualDirectoryUser',
  'OrganizationalUnit',
  'Permission',
  'PolicyPack',
  'PriorityMatrixRule',
  'Role',
  'RolePermission',
  'SavedView',
  'SecurityAuditWebhookState',
  'SlaEscalationRule',
  'SlaProfile',
  'SlaRule',
  'User',
  'UserMfa',
  'UserMfaRecoveryCode',
  'UserNotificationPreference',
  'UserNotificationSchedule',
  'UserPasskeyCredential',
  'UserPasswordHistory',
  'UserRole',
  'UserSession',
  '_prisma_migrations',
]);

async function wipeTable(client, table) {
  const parent = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'parentId'`,
    [table],
  );
  if (parent.rowCount > 0) {
    for (let pass = 0; pass < 30; pass += 1) {
      const deleted = await client.query(
        `DELETE FROM "${table}" AS row
         WHERE NOT EXISTS (
           SELECT 1 FROM "${table}" AS child WHERE child."parentId" = row.id
         )`,
      );
      if (deleted.rowCount === 0) return;
    }
  }
  await client.query(`DELETE FROM "${table}"`);
}

export async function cleanOperationalData(client) {
  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const pending = tables.rows
    .map((row) => row.tablename)
    .filter((name) => !keepTables.has(name));
  const left = new Set(pending);
  let lastError = '';
  for (let round = 0; round < 25 && left.size > 0; round += 1) {
    for (const table of [...left]) {
      await client.query('SAVEPOINT wipe_table');
      try {
        await wipeTable(client, table);
        await client.query('RELEASE SAVEPOINT wipe_table');
        left.delete(table);
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT wipe_table');
        if (error.code !== '23503' && error.code !== '23001') throw error;
        lastError = `${table}: ${error.constraint ?? error.message}`;
      }
    }
  }
  if (left.size > 0) {
    throw new Error(`Čišćenje stalo na: ${[...left].join(', ')}. Zadnje: ${lastError}`);
  }
  await client.query(`DELETE FROM "OrganizationalUnit" WHERE name = 'E2E Forward OU'`);
}
