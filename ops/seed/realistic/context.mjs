const columnsByTable = new Map();

async function tableColumns(client, table) {
  const cached = columnsByTable.get(table);
  if (cached) return cached;
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  columnsByTable.set(table, columns);
  return columns;
}

export async function insert(client, table, row) {
  const columns = await tableColumns(client, table);
  const now = new Date();
  const data = { ...row };
  if (columns.has('createdAt') && data.createdAt === undefined) data.createdAt = now;
  if (columns.has('updatedAt') && data.updatedAt === undefined) data.updatedAt = now;
  const keys = Object.keys(data).filter((key) => data[key] !== undefined);
  const columnList = keys.map((key) => `"${key}"`).join(', ');
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
  await client.query(
    `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})`,
    keys.map((key) => data[key]),
  );
}

export function seedId(suffix) {
  return `seed_${suffix}`;
}

export async function loadContext(client) {
  const users = await client.query(
    `SELECT id, email, "displayName", "organizationalUnitId" FROM "User" WHERE "isActive" = true`,
  );
  const byEmail = new Map(users.rows.map((user) => [user.email, user]));
  const user = (email) => {
    const found = byEmail.get(email);
    if (!found) throw new Error(`Nema aktivnog korisnika ${email}`);
    return found;
  };
  const groups = await client.query(`SELECT id, key, name FROM "Group"`);
  const byGroup = new Map(groups.rows.map((group) => [group.key, group]));
  const group = (key) => {
    const found = byGroup.get(key);
    if (!found) throw new Error(`Nema grupe ${key}`);
    return found;
  };
  const profiles = await client.query(`SELECT id, key FROM "SlaProfile"`);
  const byProfile = new Map(profiles.rows.map((profile) => [profile.key, profile.id]));
  const sla = (key) => {
    const id = byProfile.get(key);
    if (!id) throw new Error(`Nema SLA profila ${key}`);
    return id;
  };
  const types = await client.query(`SELECT id, key, category FROM "AssetType"`);
  const byType = new Map(types.rows.map((type) => [type.key, type]));
  const assetType = (key) => {
    const found = byType.get(key);
    if (!found) throw new Error(`Nema tipa imovine ${key}`);
    return found;
  };
  const root = await client.query(
    `SELECT id FROM "OrganizationalUnit" WHERE "parentId" IS NULL ORDER BY name LIMIT 1`,
  );
  if (!root.rows[0]) throw new Error('Nema korijenske organizacione jedinice');
  const it = await client.query(
    `SELECT id FROM "OrganizationalUnit" WHERE name = 'IT' ORDER BY name LIMIT 1`,
  );
  const requesters = users.rows.filter(
    (row) => row.email.endsWith('@test.epbih.lab') && row.organizationalUnitId,
  );
  if (requesters.length < 4) throw new Error('Premalo korisnika iz laboratorijskog imenika');
  const rules = await client.query(
    `SELECT p.key AS profile, r.priority, r."responseMinutes" AS response, r."resolutionMinutes" AS resolution
     FROM "SlaRule" r JOIN "SlaProfile" p ON p.id = r."slaProfileId"
     WHERE r."serviceId" IS NULL`,
  );
  const slaMinutes = new Map(
    rules.rows.map((row) => [`${row.profile}:${row.priority}`, row]),
  );
  return {
    user,
    group,
    sla,
    assetType,
    rootUnitId: root.rows[0].id,
    itUnitId: it.rows[0]?.id ?? root.rows[0].id,
    requesters,
    slaMinutes,
    agents: {
      desk: user('test.agent@example.com'),
      equipment: user('mudi123@gmail.com'),
      cab: user('cab@example.com'),
      problems: user('problem.manager@example.com'),
    },
  };
}
