import { ApiClient } from './api-client';
import { assertDisposableTestAccount } from './disposable-account';
import { readE2EEnvironment } from './environment';

type OrganizationalUnitNode = {
  readonly id: string;
  readonly children?: readonly OrganizationalUnitNode[];
};

/**
 * Creates USER/AGENT via the admin Users API and sets their passwords through
 * the same API (temporary password + forced change). No database access.
 */
export async function provisionTestActors(api: ApiClient): Promise<void> {
  const env = readE2EEnvironment();
  assertDisposableTestAccount(env.userEmail, 'overwrite the password');
  assertDisposableTestAccount(env.agentEmail, 'overwrite the password');
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
  await ensurePassword(api, agentId, env.agentEmail, env.agentPassword);
  await ensurePassword(api, userId, env.userEmail, env.userPassword);
}

/**
 * Sets the local password through the public API only (no database access):
 * if the configured password already works, nothing happens. Otherwise the
 * admin issues a temporary password (`POST /users/:id/reset-password`) and the
 * harness completes the forced change to the configured one. The temporary
 * password is returned only when it was NOT e-mailed, so test accounts must use
 * an address the e-mail policy does not deliver to (the reserved `example.com`).
 */
async function ensurePassword(admin: ApiClient, userId: string, email: string, password: string): Promise<void> {
  if (await canSignIn(email, password)) return;
  const reset = await admin.requestJson<{ temporaryPassword: string | null; temporaryPasswordDelivery: string }>(
    `/users/${userId}/reset-password`,
    { method: 'POST' },
  );
  if (reset.temporaryPassword === null) {
    throw new Error(
      `[e2e] the temporary password for ${email} was e-mailed (delivery=${reset.temporaryPasswordDelivery}), so the harness cannot read it. ` +
        'Use a reserved address such as e2e.user@example.com that the e-mail policy does not deliver to.',
    );
  }
  const anonymous = new ApiClient();
  const login = await anonymous.requestJson<{ status?: string; passwordChangeToken?: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: reset.temporaryPassword }),
  });
  if (login.status !== 'MUST_CHANGE_PASSWORD' || login.passwordChangeToken === undefined) {
    throw new Error(`[e2e] expected MUST_CHANGE_PASSWORD for ${email}, got ${JSON.stringify(login.status)}`);
  }
  const change = new ApiClient();
  change.setBearerToken(login.passwordChangeToken);
  await change.requestJson('/auth/change-password', { method: 'POST', body: JSON.stringify({ newPassword: password }) });
  if (!(await canSignIn(email, password))) {
    throw new Error(`[e2e] ${email}: password change did not take effect`);
  }
}

/** A full sign-in (MFA verify or enrolment included); false only for bad credentials. */
async function canSignIn(email: string, password: string): Promise<boolean> {
  try {
    await new ApiClient().login(email, password);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/INVALID_CREDENTIALS|MUST_CHANGE_PASSWORD/.test(message)) return false;
    throw error;
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
    // Tests scope their data to the first unit of the tree (`tree[0]`). When
    // the tree changes after the actors were created (new root, AD sync,
    // renamed units) an old home unit makes every USER ticket creation fail
    // with FORBIDDEN (users may only open tickets in their home unit). Keep
    // the actors aligned on every run; PATCH is idempotent.
    await api.requestJson(`/users/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ organizationalUnitId: input.organizationalUnitId }),
    });
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
