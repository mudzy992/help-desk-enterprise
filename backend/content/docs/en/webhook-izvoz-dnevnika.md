# Export of the security journal to a webhook

> **Purpose:** this page explains how to switch on the export of **authentication and security events** from the audit
> log to an address you choose (a SIEM collector, a log pipeline or your own receiver), how the receiver verifies the
> signature and what to do when delivery fails. The setting is on **Administration → Security → Security settings**, row
> **Export of the audit log to a webhook**.

## What this module is for

- It sends audit-log rows whose action starts with **`auth.`** (sign-ins, failed sign-ins, MFA, passwords, sessions) or
  **`security.`** (security events). This is the same set the **Security journal** shows.
- Other audit rows are **not** sent.
- The export is **off by default**. While it is off, nothing is sent.

## Who it is for

- **SUPER_ADMIN**, because only this role changes security settings.
- The team that runs the receiver (SIEM or log pipeline), because it needs the address, the secret and the signature rules.

## How to get there

**Administration → Security → Security settings → Export of the audit log to a webhook.** The row shows the state of the
export and opens a dialog with the fields: **export switched on**, **recipient address** and **signing secret**.

## Step by step

### Set up the receiver first

1. Prepare an HTTP(S) endpoint that accepts `POST` requests with a JSON body.
2. Choose the **signing secret**: a long random text known only to the server and the receiver.
3. The receiver should verify the signature (see below) and reject outdated requests.

### Switching on

1. In the dialog, enter the **recipient address**. `http` and `https` are allowed; the URL must not contain a user name or
   password; at most 2048 characters. **Internal addresses are allowed.** Requests are never redirected.
2. Enter the **signing secret**. It is not shown again after saving.
3. Save the address and the secret, and only then switch the **export** on. Switching it on without an address and a secret
   is refused by the application.
4. Check on the receiver that requests arrive. The first events normally arrive within a minute or two (the sending is
   checked every minute, and a new event waits at least 10 seconds).

### Changing the address or the secret

1. First **switch the export off** and save.
2. Enter the new address or secret, then switch the export on again.

### Switching off

Switching off stops the export. **Events recorded while the export was off are not sent later.** When you switch it on again,
it starts from new events.

## What the receiver gets

Each batch is a `POST` with `Content-Type: application/json` and these headers:

- `x-helpdesk-timestamp` — Unix time in seconds;
- `x-helpdesk-signature` — `sha256=` followed by the hexadecimal HMAC-SHA256 of the text `timestamp + "." + body`.

Example body (shortened):

```json
{
  "schemaVersion": 1,
  "source": "help-desk-enterprise",
  "sentAt": "2026-10-12T10:00:00.000Z",
  "events": [
    {
      "id": "cm...",
      "occurredAt": "2026-10-12T09:59:12.341Z",
      "action": "auth.login_failed",
      "entityType": "User",
      "entityId": "…",
      "actorUserId": null,
      "requestId": "…",
      "metadata": {}
    }
  ]
}
```

Passwords, hashes and secrets are never written to the audit log, so they are not sent in any field.

### Verifying the signature on the receiver

The signature is computed over the **exact bytes** of the body that arrived, before any JSON processing:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, timestamp, signature, secret) {
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

The receiver should reject a request whose `timestamp` is older than a few minutes (for example 5), which prevents replay
of a captured request.

## Fields, validations and statuses

| Setting | Default | Rule |
|---|---|---|
| `private.security.auditWebhook.enabled` | off | Can be switched on only when the address and the secret are filled in. |
| `private.security.auditWebhook.url` | empty | `http` or `https`, no user name or password, at most 2048 characters. |
| `private.security.auditWebhook.secret` | not set | HMAC-SHA256 key. Not shown after saving. |

### Delivery and errors

- Success is **only a 2xx response**. Any other outcome (HTTP status, timeout, network error, invalid address) means the
  **same batch is sent again** in the next run (every minute).
- A request has a **5-second** deadline. Redirects are refused.
- Delivery is **at least once**, so the receiver should drop duplicates by `events[].id`.
- If failures last **longer than 24 hours**, the waiting events are **dropped** (the number is recorded) and the export
  moves on to the newest event.
- An event is sent at the earliest **10 seconds** after it was recorded, so that a late-written row is not skipped.

## Frequently asked questions and errors

- **“Nothing arrives.”** — Check that the export is switched on, that the address is reachable **from the server** (not from
  your computer) and that a firewall allows incoming traffic. Events recorded before switching on are not sent.
- **“The receiver rejects the signature.”** — The body must be verified as **raw text**, not as re-serialised JSON. Check that
  the secret is the same on both sides and that the timestamp comes from the `x-helpdesk-timestamp` header.
- **“I see the same events twice.”** — This is expected when a batch is sent again. Drop duplicates by `events[].id`.
- **“Delivery has stopped.”** — Check the receiver (it must answer 2xx) and the address. If delivery fails for 15 minutes,
  the alarm **Security audit webhook export is not delivering** opens (warning); after 60 minutes it is critical
  (see [Alarms and system health](/docs/alarmi-i-zdravlje-sistema)). After 24 hours of failures, waiting events are dropped.
- **“Where can I see how many were sent?”** — On the **Security metrics (last hour)** card (SUPER_ADMIN only) there is the
  **Audit webhook export** tile: the state (OK, Not delivering or Off), the number of sent, failed and dropped events,
  the last successful delivery and the last error (a code, for example `HTTP_500`, `TIMEOUT`, `NETWORK`, `INVALID_URL`).
  The address and the secret are never shown on the tile.

## Known limitations

- The tile and the alarm show the delivery state, not the content of the events. Check individual events on the receiver.
- An `http` address sends the body without encryption. For networks outside controlled infrastructure, use `https`.
- An event written more than 10 seconds after the cursor may be skipped. This is rare and accepted.

## Related modules

- [Alarms and system health](/docs/alarmi-i-zdravlje-sistema) — alarms for sign-ins and CAPTCHA, and the alarm for the state of this export.
- [Human verification (CAPTCHA)](/docs/captcha-provjera) — the sign-in check whose events are sent.
- [Roles and permissions (RBAC)](/docs/uloge-i-permisije) — who may change security settings.
