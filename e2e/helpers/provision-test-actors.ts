import {
  generateActorPassword,
  generatedPasswordAttempts,
  recordActorPassword,
} from './actor-passwords';
import { ApiClient, ApiRequestError } from './api-client';
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
  if (!api.hasSession()) {
    await api.login(env.superAdminEmail, env.superAdminPassword);
  }
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
  await restoreTestActorPassword(api, { userId: agentId, email: env.agentEmail, password: env.agentPassword });
  await restoreTestActorPassword(api, { userId, email: env.userEmail, password: env.userPassword });
}

/** A refusal of the candidate password itself — never a transport or server failure. */
type PasswordRefusal = {
  readonly code: string;
  readonly violations: readonly string[];
};

/**
 * Sets the local password through the public API only (no database access):
 * if the configured password already works, nothing happens. Otherwise the
 * admin issues a temporary password (`POST /users/:id/reset-password`) and the
 * harness completes the forced change to the configured one. The temporary
 * password is returned only when it was NOT e-mailed, so test accounts must use
 * an address the e-mail policy does not deliver to (the reserved `example.com`).
 *
 * Paket 5.4.0-f: exported because it is also the way a spec **restores** an
 * actor after a destructive action of the suite. `POST /security/bulk-password-reset`
 * raises `mustChangePassword` for every local account without touching a single
 * password, so a spec that exercises it must put the actors back — and a plain
 * password change cannot do that: the account already uses the configured
 * password, and reusing a current password is refused (`PASSWORD_REUSED`). The
 * admin reset bypasses the history, which is exactly why this path works.
 *
 * Paket 5.4.0-f (fix after the first full run): the configured password is tried
 * first, but the deployment may refuse it, because since 5.4.0-d every new
 * password is checked against the Pwned Passwords range API (default ON) and a
 * value that appears in a breach corpus is answered with
 * `400 INVALID_PASSWORD { violations: ['PWNED_PASSWORD'] }`. That is the product
 * working, not a stack problem — so the harness generates a password instead
 * (which still has to pass every rule, it is only absent from any corpus) and
 * records it for the rest of the run. A stale or weak `E2E_*_PASSWORD` secret
 * therefore stops the run from failing, but never silently: the warning names
 * the actor and the violation, and `E2E_ACTOR_PASSWORD_FALLBACK=off` turns the
 * fallback back into a hard error for whoever wants it.
 */
export async function restoreTestActorPassword(
  admin: ApiClient,
  input: { readonly email: string; readonly password: string; readonly userId?: string },
): Promise<void> {
  const { email, password } = input;
  assertDisposableTestAccount(email, 'overwrite the password');
  if (await canSignIn(email, password)) return;
  const userId = input.userId ?? (await findUserId(admin, email));

  const first = await completeForcedChange(admin, userId, email, password);
  if (first === null) return;

  const message =
    `[e2e] the deployment refused the configured password for ${email} ` +
    `(${first.code}${first.violations.length > 0 ? `: ${first.violations.join(', ')}` : ''}).`;
  if (process.env.E2E_ACTOR_PASSWORD_FALLBACK === 'off') {
    throw new Error(
      `${message} Rotate the E2E_*_PASSWORD secret to a value the deployment accepts ` +
        '(a password from a breach corpus is refused by design), or unset E2E_ACTOR_PASSWORD_FALLBACK.',
    );
  }
  console.warn(
    `${message} Using a generated password for this run — rotate the E2E_*_PASSWORD secret ` +
      'so the next run starts from it.',
  );

  let last: PasswordRefusal = first;
  for (let attempt = 0; attempt < generatedPasswordAttempts; attempt += 1) {
    const generated = generateActorPassword();
    const refusal = await completeForcedChange(admin, userId, email, generated);
    if (refusal === null) {
      recordActorPassword(email, generated);
      return;
    }
    last = refusal;
  }
  throw new Error(
    `[e2e] ${email}: the deployment refused ${generatedPasswordAttempts} generated passwords ` +
      `(${last.code}${last.violations.length > 0 ? `: ${last.violations.join(', ')}` : ''}) after refusing the configured one. ` +
      'Check the password policy of this deployment (length, organisation words, blocklist).',
  );
}

/**
 * One login-plus-forced-change cycle for a single candidate password. Returns
 * `null` when the deployment accepted it, or the policy refusal when the
 * candidate itself is the problem; anything else (a missing temporary password,
 * a server error, a network problem) is thrown and never treated as a refusal.
 */
async function completeForcedChange(
  admin: ApiClient,
  userId: string,
  email: string,
  candidate: string,
): Promise<PasswordRefusal | null> {
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
  try {
    await change.requestJson('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword: candidate }),
    });
  } catch (error) {
    // A refused candidate is the only thing handled here. The token is not
    // consumed by a refusal (the change is validated before it is applied), so
    // the caller may try another password on the same temporary login.
    if (error instanceof ApiRequestError && error.status === 400 && error.code === 'INVALID_PASSWORD') {
      return { code: error.code, violations: error.violations };
    }
    throw error;
  }
  if (!(await canSignIn(email, candidate))) {
    throw new Error(`[e2e] ${email}: password change did not take effect`);
  }
  return null;
}

/** The admin users API, filtered by the exact address (never a broad listing). */
async function findUserId(admin: ApiClient, email: string): Promise<string> {
  const users = await admin.requestJson<Array<{ id: string; email: string }>>(
    `/users?q=${encodeURIComponent(email)}&take=10`,
  );
  const target = users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (target === undefined) {
    throw new Error(`[e2e] configured actor ${email} was not found through the users API`);
  }
  return target.id;
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
  // `POST /users` answers `{ user, temporaryPassword, temporaryPasswordDelivery }`
  // (see backend/src/modules/users/users.types.ts), not the user itself.
  const created = await api.requestJson<{ user: { id: string } }>('/users', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      displayName: input.displayName,
      roleKey: input.roleKey,
      organizationalUnitId: input.organizationalUnitId,
    }),
  });
  return created.user.id;
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
