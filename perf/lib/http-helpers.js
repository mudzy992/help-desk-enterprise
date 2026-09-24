import http from 'k6/http';
import { check } from 'k6';

/** JSON headers plus a bearer token when one is available. */
export function authorizedHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

/**
 * Logs in once in `setup()` and returns the access token, or null when the
 * credentials are not usable — a load test without tokens must fail loudly in
 * the checks, not silently measure 401s as "traffic".
 */
export function login(config, credentials) {
  const response = http.post(
    `${config.baseUrl}${config.paths.login}`,
    JSON.stringify({ email: credentials.email, password: credentials.password }),
    { ...authorizedHeaders(null), tags: { endpoint: 'auth.login' } },
  );
  if (response.status !== 200 && response.status !== 201) {
    return null;
  }
  return readAccessToken(response);
}

function readAccessToken(response) {
  try {
    const body = response.json();
    if (body && typeof body.accessToken === 'string') {
      return body.accessToken;
    }
    if (body && typeof body.token === 'string') {
      return body.token;
    }
    return null;
  } catch {
    return null;
  }
}

/** Response size in kilobytes, used for the payload budgets. */
export function payloadKb(response) {
  return Number((response.body ? response.body.length : 0) / 1024);
}

/** One token per virtual user, spread evenly across the pool. */
export function pickToken(tokens, index) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return null;
  }
  return tokens[index % tokens.length];
}

export function expectOk(response, endpoint) {
  check(response, {
    [`${endpoint} returns 2xx`]: (value) =>
      value.status >= 200 && value.status < 300,
  });
}
