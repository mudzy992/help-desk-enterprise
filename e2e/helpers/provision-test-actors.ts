import { hash } from 'bcrypt';
import { ApiClient } from './api-client';
import { readE2EEnvironment } from './environment';

type OrganizationalUnitNode = {
  readonly id: string;
  readonly children?: readonly OrganizationalUnitNode[];
};

/**
 * Decision A: create USER/AGENT via admin Users API, then set local password hashes
 * through Postgres (no production password endpoint).
 */
export async function provisionTestActors(api: ApiClient): Promise<void> {
  const env = readE2EEnvironment();
  await api.login(env.superAdminEmail, env.superAdminPassword);
  const tree = await api.requestJson<OrganizationalUnitNode | OrganizationalUnitNode[]>(
    '/organizational-units/tree',
  );
  const organizationalUnitId = firstUnitId(tree);
  if (organizationalUnitId === null) {
    throw new Error('No organizational unit available for E2E actors');
  }
  const userId = await ensureUser(api, {
    email: env.userEmail,
    displayName: 'E2E User',
    roleKey: 'USER',
    organizationalUnitId,
  });
  const agentId = await ensureUser(api, {
    email: env.agentEmail,
    displayName: 'E2E Agent',
    roleKey: 'AGENT',
    organizationalUnitId,
  });
  if (env.databaseUrl === null) {
    console.warn(
      '[e2e] DATABASE_URL missing — actors created without local passwords',
    );
    return;
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: env.databaseUrl });
  await client.connect();
  try {
    const userHash = await hash(env.userPassword, 10);
    const agentHash = await hash(env.agentPassword, 10);
    await client.query(
      `UPDATE "User" SET "localPasswordHash" = $1, "isLocalOnly" = true, "isActive" = true WHERE id = $2`,
      [userHash, userId],
    );
    await client.query(
      `UPDATE "User" SET "localPasswordHash" = $1, "isLocalOnly" = true, "isActive" = true WHERE id = $2`,
      [agentHash, agentId],
    );
  } finally {
    await client.end();
  }
}

async function ensureUser(
  api: ApiClient,
  input: {
    readonly email: string;
    readonly displayName: string;
    readonly roleKey: string;
    readonly organizationalUnitId: string;
  },
): Promise<string> {
  const users = await api.requestJson<Array<{ id: string; email: string }>>(
    '/users',
  );
  const existing = users.find(
    (user) => user.email.toLowerCase() === input.email.toLowerCase(),
  );
  if (existing !== undefined) {
    return existing.id;
  }
  const created = await api.requestJson<{ id: string }>('/users', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      displayName: input.displayName,
      roleKey: input.roleKey,
      organizationalUnitId: input.organizationalUnitId,
    }),
  });
  return created.id;
}

function firstUnitId(
  tree: OrganizationalUnitNode | OrganizationalUnitNode[],
): string | null {
  const roots = Array.isArray(tree) ? tree : [tree];
  const queue = [...roots];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) {
      break;
    }
    if (node.id.length > 0) {
      return node.id;
    }
    queue.push(...(node.children ?? []));
  }
  return null;
}
