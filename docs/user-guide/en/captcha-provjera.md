---
title: Human verification (CAPTCHA)
slug: captcha-provjera
module: —
part: administrator
audience: [SUPER_ADMIN, Administrator]
roles: [SUPER_ADMIN]
order: 130
tags: [captcha, turnstile, cloudflare, sign-in, mfa, robot, verification, site-key, secret-key]
---
# Human verification (CAPTCHA)

> **Purpose:** this page explains how to switch on, configure and switch off the **Cloudflare Turnstile** check at sign-in,
> what it protects, how it behaves when Cloudflare is not reachable and how to read its alarm. The setting is on
> **Administration → Security → Security settings**, row **Human verification (CAPTCHA)**.

## What this module is for

- The check protects sign-in from **automated attempts** (password guessing from many addresses, or bots).
- It does **not** replace the sign-in rate limits: the limiter keeps counting failures and temporarily blocks an address.
  CAPTCHA is added on top of it.
- It is **off by default** (`none`). An installation without keys, or without internet access, works exactly as before:
  no request goes to Cloudflare.

## Who it is for

- **SUPER_ADMIN**, because only this role changes security settings.
- Administrators who work with alarms, because two alarms follow this check (see
  [Alarms and system health](alarmi-i-zdravlje-sistema.md)).

## How to get there

**Administration → Security → Security settings → Human verification (CAPTCHA).** The row shows the state (on or off)
and opens a dialog with the settings. The other security settings (sessions, breached-password check) are in the same card.

## Step by step

### Switching on

1. In the **Cloudflare** dashboard, create a **Turnstile widget** for the application's domain.
2. Copy the **Site key** (public) and the **Secret key** from the widget.
3. In the dialog **Human verification (CAPTCHA)**, choose the provider **turnstile**, enter the **site key** and the
   **secret key**, and save.
4. The keys **depend** on the provider: while the provider is `none`, they cannot be saved. If you try, the application
   refuses the change and says what must be switched on first.
5. Check it: sign in with a wrong password five times in a row from one address; on the sixth attempt the check should
   appear. If it does not, check that the provider is really `turnstile` and that both keys are filled in.

### Switching off

1. In the dialog, choose the provider **none** and save.
2. The application offers **Switch off and reset dependents**. This empties the **site key** and **deletes the secret
   key**. If you switch CAPTCHA on again later, you must enter the secret key again.

### Replacing the keys

If Cloudflare replaces the widget, switch the provider to `turnstile` and enter the new keys in the same dialog. The old
secret key cannot be read; you enter the new one.

## When the check is required

| Sign-in flow | Check | Note |
|---|---|---|
| **Password** (sign-in with e-mail and password) | Yes | After **five consecutive failures** from the same IP address. If the address limit is stricter (for example a block after three failures), the check is required earlier, before the block. |
| **Second step: code from the app or a recovery code** | Yes | After **five consecutive wrong codes** for that account. The check appears above the code field. |
| **Passkey (FIDO2) — sign in with a device** | No | The check is required only for the password and the second-step code, not for signing in with a passkey. |
| **Microsoft sign-in (Entra)** | No | Sign-in with a Microsoft account is not covered. |
| **Password change and security actions** | No | No CAPTCHA is required. |

A solved check is good for **one attempt**. If it has expired or was already used, the check resets and is requested again.

## Fields, validations and statuses

| Setting | Value | Note |
|---|---|---|
| `private.security.captcha.provider` | `none` (default) or `turnstile` | `none` switches the check off; `turnstile` switches it on. |
| `private.security.captcha.siteKey` | text | Public key, shown on the sign-in page. Empty while the provider is `none`. |
| `private.security.captcha.secretKey` | secret | Never shown in the browser, never sent to the client and never written to the log. The stored value cannot be read back. |

Statuses at sign-in:

- `CAPTCHA_REQUIRED` — a solved check is required. The user sees “Human verification”.
- `CAPTCHA_FAILED` — the solution was not accepted (expired, already used or invalid).

The user-facing details are on the page [Sign-in and two-step verification (MFA)](prijava-i-mfa.md).

## Frequently asked questions and errors

- **“I switched the check on, but it does not appear at sign-in.”** — The check appears only after five failures. Check
  that the provider is `turnstile` and that the site key and the secret key are saved.
- **“The user sees “The check did not load”.”** — The browser or the server cannot reach Cloudflare. Check the network and
  the server's outbound access. If the installation has no internet access by design, set the provider back to `none`.
- **“Alarm: CAPTCHA checks are skipped.”** — The server gets no answer from Cloudflare. Sign-ins then pass on the sign-in
  limits only and are not blocked. Check the server's outbound access to Cloudflare.
- **“Alarm: CAPTCHA challenges are often refused.”** — The client sends unacceptable solutions. If there are no real users,
  it is an automated client. See the instruction next to the alarm.
- **“Everyone in the same office sees the check.”** — The check is counted per IP address. Many users behind one address
  (NAT or proxy) share the counter.

## Known limitations

- The check is counted **per IP address**, not per account.
- No check for Microsoft sign-in, passkey, password change and security actions.
- The secret key cannot be read back, even after saving; it is changed by entering a new one.
- If the server cannot reach Cloudflare, the check is **skipped**, not used to block the sign-in. This is intentional.

## Related modules

- [Sign-in and two-step verification (MFA)](prijava-i-mfa.md) — what the user sees and does at sign-in.
- [Alarms and system health](alarmi-i-zdravlje-sistema.md) — alarms for refused and skipped checks.
- [Roles and permissions (RBAC)](uloge-i-permisije.md) — who may change security settings.
