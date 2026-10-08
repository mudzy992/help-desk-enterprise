#!/usr/bin/env python3
"""Perf-smoke CI provisioning, run after the install wizard (`.github/workflows/perf-smoke.yml`).

Why this exists (2026-10-08): since paket 5.1 the founder password obeys the account
password policy, and since paket 2.1 a SUPER_ADMIN must enrol MFA on first sign-in. The
workflow used to log every k6 virtual user in as the SuperAdmin with a plain password —
that now yields `MFA_ENROLLMENT_REQUIRED` (and later `MFA_REQUIRED`), never a token.

What it does, using the public API only and the Python standard library:
  1. signs the SuperAdmin in and completes the forced TOTP enrolment (RFC 6238);
  2. creates the non-admin accounts k6 uses (AGENT + USER) in the seeded unit, takes the
     temporary password from the create response (no SMTP in CI -> delivery `ui`) and
     sets the final password through the forced change;
  3. adds the agent to the seeded fallback group, so `/tickets/inbox` lists the seeded
     tickets and detail/reply are measured;
  4. proves both accounts get a session with a plain password login (what k6 does);
  5. writes the SuperAdmin bearer token to a file for the ticket-seed step.

Every failure prints the endpoint, status and (truncated) body and exits non-zero.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:10001").rstrip("/")
LOG_PATH = os.environ.get("PERF_PROVISION_LOG", "/tmp/install-wizard.log")
SEED_FILE = os.environ.get("PERF_SEED_FILE", "/tmp/install-install-seed.json")
TOKEN_FILE = os.environ.get("PERF_ADMIN_TOKEN_FILE", "/tmp/perf-admin-token.txt")


def note(message: str) -> None:
    print(message, flush=True)
    with open(LOG_PATH, "a", encoding="utf-8") as handle:
        handle.write(message + "\n")


def fail(message: str) -> None:
    note(f"::error::{message}")
    sys.exit(1)


def request(method: str, path: str, body: object | None = None, token: str | None = None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        status = error.code
    try:
        parsed = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        parsed = None
    return status, parsed, raw


def expect(method: str, path: str, body=None, token=None, ok=(200, 201, 204)):
    status, parsed, raw = request(method, path, body, token)
    note(f"{method} {path} -> HTTP {status}")
    if status not in ok:
        note(f"  {raw[:400]}")
        fail(f"{method} {path} returned HTTP {status}")
    return parsed


def totp(secret: str, step: int | None = None) -> str:
    """RFC 6238: SHA-1, 6 digits, 30 s — same as e2e/helpers/mfa.ts."""
    clean = secret.replace(" ", "").replace("=", "").upper()
    key = base64.b32decode(clean + "=" * ((-len(clean)) % 8))
    counter = int(time.time()) // 30 if step is None else step
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{binary % 1_000_000:06d}"


def admin_session(email: str, password: str) -> str:
    login = expect("POST", "/auth/login", {"email": email, "password": password})
    status = (login or {}).get("status")
    note(f"  admin sign-in status: {status or 'session'}")
    if (login or {}).get("accessToken"):
        return login["accessToken"]
    if status != "MFA_ENROLLMENT_REQUIRED":
        # MFA_REQUIRED would mean an enrolled factor whose secret this run does not know —
        # impossible on the throwaway CI database, so it is reported, not worked around.
        fail(f"unexpected sign-in status for {email}: {status}")
    mfa_token = login["mfaToken"]
    started = expect("POST", "/auth/mfa/enroll/start", {"mfaToken": mfa_token})
    secret = (started or {}).get("secret")
    if not secret:
        fail("MFA enrolment start returned no secret")
    confirmed = expect(
        "POST", "/auth/mfa/enroll/confirm", {"mfaToken": mfa_token, "code": totp(secret)}
    )
    token = (confirmed or {}).get("accessToken")
    if not token:
        fail("MFA enrolment confirm returned no access token")
    return token


def first_unit_id(tree) -> str | None:
    nodes = tree if isinstance(tree, list) else [tree]
    for node in nodes:
        if isinstance(node, dict):
            if node.get("id"):
                return node["id"]
            found = first_unit_id(node.get("children") or [])
            if found:
                return found
    return None


def read_seed() -> dict:
    try:
        with open(SEED_FILE, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}


def create_account(token: str, email: str, password: str, name: str, role: str, unit_id: str) -> str:
    created = expect(
        "POST",
        "/users",
        {"email": email, "displayName": name, "roleKey": role, "organizationalUnitId": unit_id},
        token,
    )
    user_id = ((created or {}).get("user") or {}).get("id")
    temporary = (created or {}).get("temporaryPassword")
    if not user_id or not temporary:
        fail(
            f"{email}: no id/temporary password in the create response "
            f"(delivery={(created or {}).get('temporaryPasswordDelivery')})"
        )
    login = expect("POST", "/auth/login", {"email": email, "password": temporary})
    change_token = (login or {}).get("passwordChangeToken")
    if (login or {}).get("status") != "MUST_CHANGE_PASSWORD" or not change_token:
        fail(f"{email}: expected MUST_CHANGE_PASSWORD, got {(login or {}).get('status')}")
    expect("POST", "/auth/change-password", {"newPassword": password}, change_token)
    return user_id


def prove_login(email: str, password: str) -> None:
    login = expect("POST", "/auth/login", {"email": email, "password": password})
    if not (login or {}).get("accessToken"):
        note(f"  {json.dumps(login)[:400]}")
        fail(f"{email}: a plain password login gives k6 no token (status={(login or {}).get('status')})")


def main() -> None:
    env = os.environ
    admin_email, admin_password = env["PERF_ADMIN_EMAIL"], env["PERF_ADMIN_PASSWORD"]
    agent_email, agent_password = env["PERF_AGENT_EMAIL"], env["PERF_AGENT_PASSWORD"]
    user_email, user_password = env["PERF_REQUESTER_EMAIL"], env["PERF_REQUESTER_PASSWORD"]

    token = admin_session(admin_email, admin_password)
    expect("GET", "/auth/security", token=token)

    seed = read_seed()
    unit_id = (seed.get("organizationalUnit") or {}).get("id") or first_unit_id(
        expect("GET", "/organizational-units/tree", token=token)
    )
    group_id = (seed.get("fallbackGroup") or {}).get("id")
    if not unit_id or not group_id:
        fail(f"seed ids missing (unit={unit_id}, fallbackGroup={group_id}) — is {SEED_FILE} there?")

    agent_id = create_account(token, agent_email, agent_password, "Perf Agent", "AGENT", unit_id)
    create_account(token, user_email, user_password, "Perf Requester", "USER", unit_id)
    expect("POST", f"/groups/{group_id}/members/{agent_id}", token=token)

    prove_login(agent_email, agent_password)
    prove_login(user_email, user_password)

    with open(TOKEN_FILE, "w", encoding="utf-8") as handle:
        handle.write(token)
    note("provisioning done: SuperAdmin (MFA enrolled), agent in fallback group, requester")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        # RFC 6238 Appendix B vector (SHA-1, T=59 s -> step 1): 94287082 -> last 6 digits.
        rfc_secret = base64.b32encode(b"12345678901234567890").decode()
        assert totp(rfc_secret, 1) == "287082", totp(rfc_secret, 1)
        print("self-test ok")
    else:
        main()
