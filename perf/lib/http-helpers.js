import http from 'k6/http';
import { check } from 'k6';

const SESSION_COOKIE = 'helpdesk_session';

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
  return readSessionToken(response);
}

/**
 * The API keeps the session in the httpOnly `helpdesk_session` cookie and no longer
 * returns `accessToken` in the body. The cookie value is the same JWT, which k6 sends
 * back as a bearer token (bearer needs no Origin check).
 */
function readSessionToken(response) {
  const cookies = response.cookies[SESSION_COOKIE];
  if (!cookies || cookies.length === 0 || !cookies[0].value) {
    return null;
  }
  return cookies[0].value;
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
