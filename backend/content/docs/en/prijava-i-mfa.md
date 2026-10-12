# Sign-in and two-step verification (MFA)

## What this module is for

Signing in is the way into the application: the user name is your **e-mail**, and together with the password a
**two-step verification** (a one-time code from an app on your phone) may be required. Sign-in also brings
**“Account security”**, the page where every user changes the password, manages two-step verification and reviews
their active sessions.

## Who it is for

It is meant for **all users** (sign-in and their own account), while some parts are meant for **agents** and
**administrators** (resetting someone else's two-step verification and signing out their sessions).

## How to get there

- **Sign-in:** the `/login` address, or an automatic redirect when you reach any page without a session.
- **Account security:** click your name (bottom-left corner) → **Account security** (`/account/security`).
- **Administering someone else's account:** **Users** → open the user → the **Account security** section.

## Step by step

### Signing in with a local account

1. Enter the **E-mail** and the **Password** and click **Sign in**.
2. If the credentials are correct, the application opens. If not: “Sign-in failed. Check the e-mail and password.”
3. **Remember me on this device (30 days)** — the sign-in lasts 30 days instead of one hour; recommended only on
   your own, locked device. A SUPER_ADMIN account is never remembered (the break-glass entry stays short-lived),
   and signing out or changing the password ends the memory.
4. Local password sign-in has separate account and IP limits. After three wrong passwords for an account, a
   bounded progressive delay is added (starting at 250 ms and rising to at most 2 seconds); the account is never
   locked — a correct password still passes after wrong attempts. Account state uses a 30-minute window, and a
   successful sign-in clears that account state.
5. The source IP may receive a temporary `429` after 40 failed local sign-ins within 5 minutes. The answer
   carries `retryAfterSeconds` (how long the block still lasts). All local sign-ins from that IP share this
   threshold; a successful sign-in does not clear the IP window.
6. **The thresholds are configurable.** A SuperAdmin changes them in **Admin → Security → Login limits** (eight
   values in three rows, with a mandatory reason and identity confirmation); the change applies immediately
   without a restart. The numbers in steps 4 and 5 are the installation defaults.
7. **Human verification (CAPTCHA)** — if a SuperAdmin turned Turnstile on, after **five failed sign-ins from the
   same IP address** the sign-in also asks for a solved challenge; without it the server refuses the attempt
   (`CAPTCHA_REQUIRED`) and the sign-in page shows the challenge. A solution is good for **one** attempt — if
   that one fails too, the challenge is solved again; with the check off (the default) this step does not exist.

### Signing in with a Microsoft account (when configured that way)

1. On the sign-in screen click **Sign in with a Microsoft account**.
2. Sign in on the Microsoft page (Microsoft handles the password, the second factor and the access rules).
3. If Microsoft sign-in is not configured, the application says so and offers the local form through the
   **Sign in with a local account** link. The SuperAdmin account always has a local password as well (the
   break-glass entry).

### Forced password change

1. If the password is temporary or expired, **Change your password** is shown after sign-in.
2. Enter the **New password** and the **Password confirmation** and click **Save and continue**.
3. The password must be at least as long as configured (12 by default), must not equal the e-mail, must not
   contain the organisation name or part of your e-mail address, and must not be among the most common passwords.
   If the organisation requires it, it must differ from the previous passwords as well.
4. If the password expired, the text above says “Your password expired…”; if it is temporary, an introductory
   text about setting a new password is shown.
5. After the change, all other sessions of that account are signed out.

### Enrolling two-step verification for the first time

1. When two-step verification is required but not enrolled, **Set up two-step verification** is shown after
   sign-in.
2. Install an authenticator app (Microsoft Authenticator, Google Authenticator, FreeOTP…).
3. Scan the **QR code** or type the **manual entry key**.
4. Enter the six-digit **code from the app** and click **Enable**.
5. The **Recovery codes** are shown; save them (**Copy** or **Download .txt**), tick **I have saved the recovery
   codes** and click **Continue**. The codes cannot be shown again later.

**After a security upgrade:** recovery codes issued under the previous hash scheme are no longer accepted because
there is no safe way to convert their stored hashes. Two-step verification (TOTP) stays enabled. Sign in with
your authenticator app, then open **Account security** → **New recovery codes**, confirm with TOTP, and save the
new set. If you cannot use TOTP, contact an administrator for an **MFA reset**.

### Signing in with two-step verification enabled

1. After the correct password, **Two-step verification** is required.
2. If the account also has a passkey, two choices appear above the form: **Code from the app** and
   **Use the passkey / device**. With a passkey, click **Confirm with the passkey** and approve the sign-in on the
   device (Windows Hello, Touch ID, Face ID or a security key) — no code is typed. The choice is remembered per
   device, so the next sign-in opens on the factor you used last; the app code always remains available as the
   second choice.
3. Enter the **code from the app** and click **Confirm** (the code changes every 30 seconds).
4. If you have no phone, click **I have no access to the app — use a recovery code**, enter one of the saved codes
   and confirm. A recovery code works only once.
5. Every code (recovery ones included) can be used only once; the application checks that on the server too.

### Account security (your own account)

- **Two-step verification (MFA):** the status **Enabled**/**Disabled**, the badge **Required for your account**
  when so, and the buttons **Enable two-step verification**, **New recovery codes** and **Disable two-step
  verification**. Disabling and new codes require a code from the app.
- **Password:** **Current password**, **New password**, **Password confirmation** and the **Change password**
  button. The rules (minimum length, history) are written above the fields. If the password has a term, the badge
  **Expires …** is shown, and 14 days before expiry a banner appears at the top: **“Your password expires in N
  days. Change it now.”**
- **Active sessions:** the device list (device, shortened IP address, time), a **Sign out** button per session and
  **Sign out all others** (this session stays active). Your own session is marked **This device**.
- If the account signs in through Microsoft, it says **“Your account has no local password — the password is
  managed by Microsoft.”** and the password field is not shown.

### For administrators: someone else's account

1. **Users** → the user → **Account security**: the two-step verification status, the last password change, the
   password expiry and the list of active sessions.
2. **Reset MFA** — requires a **reason**; on the next sign-in the user must enrol the second factor again. The
   reset signs out all sessions of that user.
3. **Sign out all sessions** — signs the user out on all devices.
4. Your own account is not changed this way: use **Account security** in your own menu.

### For administrators: the policy (Admin → Settings)

The **Sign-in and directory** category holds the rules that apply to everyone:

| Setting | Meaning |
|---|---|
| Two-step verification (TOTP) required for ADMIN accounts with a local password | SUPER_ADMIN is always required; ADMIN according to this setting |
| Other users with a local password may enable two-step verification themselves | the permission for self-enrolment; turning it off stops **new** enrolments, while users who already enrolled still enter their code at every sign-in |
| The name the authenticator app shows next to the account | empty = the application name |
| Minimum length of a local password | 12–64 |
| Reject the most common passwords, the organisation name and parts of the user's own e-mail address (offline list) | on/off |
| Organisation words the password must not contain | comma-separated; the application name and internal domains are added |
| Number of previous passwords that must not be reused | 0 = no check |
| Local password expiry in days (except SUPER_ADMIN) | 0 = no expiry |
| Password expiry of the SUPER_ADMIN account in days | 0 = no expiry; default 365 |
| Maximum number of simultaneous sessions per user | 0 = no limit; exceeding it signs out the oldest |
| Notify ADMIN/SUPER_ADMIN about a sign-in from a new device or network | on/off |

### For administrators: “Security” — journal and metrics

The **Security** tab of the **Admin** screen is visible to **SUPER_ADMIN** only; a plain administrator sees the
message “Security is available to the superadministrator only” and no request is sent.

- **Security journal** — a chronological list filtered to `auth.*` events from the shared audit log (sign-ins,
  failed sign-ins, sign-outs, two-step verification, password changes and resets, lockouts, limit changes).
  The filters are **Event** (“All auth events” or one action) and **Person** (at least two characters, picked from
  a list; covers records where the person is the target or the actor). The columns are **Time**, **Event**,
  **Target**, **Actor** and **Details**, and the **Load more** button fetches older records. Details show the
  record's metadata (method, device, reason) — never passwords or codes, and field names and value codes (such as
  `must_change`) are translated into the interface language; an unknown actor (a failed sign-in) is shown as
  **Pseudonym**, and system records as **System**.

On the **Security** tab, **above** the security journal, the following cards appear (in **Settings → Security**
the **Security administration** row only points there — values are edited in one place):

- **Login rate limits** — the eight thresholds (the per-account window and delay, the IP block and the “other”
  flows), grouped into three rows (**Per-account delay**, **Per-IP block**, **Other security flows**) that show the
  current values. A row opens a dialog: each field shows its allowed range, and a change needs a **reason** (at
  least 5 characters) and a proof of identity with a code or a passkey.
- **Security settings** — three rows: **Session lifetime and cut-off** (remember-me and the idle cut-off), the
  **Breached-password check** (on/off) and **Human verification (CAPTCHA)** (on/off; on means a sign-in that
  failed five times from one address also asks for a Cloudflare Turnstile solution, while the secret key is kept
  as a secret setting and is never rendered). Each row shows its state and opens the same dialog as every other setting
  (reason, dependencies, journal record). The card itself holds no form — editing happens in the dialog only.
- **Force every local password to change** — every local account (except SUPER_ADMIN and Microsoft accounts) gets
  a required password change and all its sessions end; the person changes the password at the next sign-in.

### For administrators: passkeys (FIDO2) — requirements and diagnostics

A passkey is a second factor next to the authenticator code. It needs the following (installation settings, not
user settings):

- **HTTPS and the exact host name.** `CORS_ORIGIN` (or `WEBAUTHN_RP_ID`) must match the address people open in the
  browser, for example `https://helpdesk.example.com`. Over `localhost`, an IP address or a different host name
  the browser refuses the ceremony (`SecurityError`) and the server-side confirmation fails.
- **The QR flow (a phone as the authenticator)** needs a **public domain** and Bluetooth on both devices. Phones
  cannot save a passkey for `localhost` or an IP address — the phone reports a generic error and the computer
  times out. To try it on one machine, use Windows Hello / Touch ID.
- **Adding a passkey:** **My profile → Account security → Passkey → Add a passkey**. When the account has an
  authenticator code, the code is asked for **after** the device confirmation.
- **A failed confirmation does not sign you out.** A wrong code or a refused passkey only shows a message; the
  session stays alive (a 401 from the confirmation used to end it).
- **Diagnostics:** the server logs the reason for a refusal (`passkey registration refused …` /
  `passkey assertion refused …`) — the message names what did not match (origin, RP ID, challenge, counter).

The **Monitoring** tab also carries the **Security metrics (last hour)** card: four tiles with the numbers (total
blocks, peak per minute, second-factor failures and skipped HIBP checks) and a chart of **Blocks (429)** and
**Per-account delays** — two bar strips, one bar per minute of the last hour, on a shared scale with at most five
axis labels, so the chart always stays inside its card. The numbers are aggregated per minute and carry no personal
data.

## Fields, validations and statuses

| Field / status | Rule |
|---|---|
| E-mail | required, e-mail format |
| Password at sign-in | required; whether the e-mail exists is not revealed |
| New password | at least `private.auth.password.minLength` characters (12–64); must not equal the e-mail, contain the organisation name, part of the e-mail address, or be among the most common passwords; with history enabled, it must not repeat. The forced change screen states the same minimum (the server sends it with the sign-in response) |
| Code from the app | 6 digits, ±30 s tolerance |
| Recovery code | the `xxxxx-xxxxx` format, single use |
| Sign-in statuses | `MUST_CHANGE_PASSWORD` (temporary/expired password), `MFA_REQUIRED` (enrolled second factor), `MFA_ENROLLMENT_REQUIRED` (required but not enrolled), `CAPTCHA_REQUIRED` (a solved challenge is required), `CAPTCHA_FAILED` (the solution was not accepted) |
| Intermediate step lifetime | password change 15 minutes, two-step verification 5 minutes |
| Session | 1 hour, extended while you work; an idle tab signs itself out |

## Frequent questions and errors

| Message / situation | What it means and what to do |
|---|---|
| “Sign-in failed. Check the e-mail and password.” | Wrong e-mail or password; it does not say which one. |
| `429 TOO_MANY_LOGIN_ATTEMPTS` | The temporary IP threshold for local sign-ins has been reached; the account is not locked. Wait for the IP window to expire, then try again. |
| `CAPTCHA_REQUIRED` — a “Human verification” block appears | Five sign-ins from your address failed, so the server asks for a human check. Solve it and submit the sign-in again; the check is asked for as long as the failure window lasts. |
| “The check did not load. Check the connection…” | The browser (or the server) cannot reach the Cloudflare Turnstile service. Check the connection and try again; if it repeats, tell an administrator — on an installation without internet access the check stays off. |
| `CAPTCHA_FAILED` — “The check was not accepted” | The solution expired or was already used (it is single use); the widget resets, so solve it again and submit the sign-in. |
| “The code is not valid or has already been used.” | The code expired, was mistyped or was already used; wait for a new code or use a recovery code. |
| “The sign-in step expired (valid for 5 minutes).” | You waited too long on the code screen; go back to sign-in and repeat. |
| “The setup expired. Start over.” | Enrolling two-step verification takes 15 minutes; start the enrolment again. |
| “Two-step verification is not configured on the server (MFA_ENCRYPTION_KEY).” | An administrator must set the key; until then the second factor cannot be enabled. |
| “The current password is not correct.” | The current password was typed wrong while changing it. |
| “This password was used recently. Choose a new one.” | The password is in the history; choose another. |
| “The action failed. Try again.” | A generic error; if it repeats, check the connection or contact an administrator. |
| I have no recovery codes left | An administrator can do an **MFA reset**, after which you enrol the second factor again. |
| I changed my phone | **New recovery codes** do not help; an **MFA reset** is needed (from an administrator), or a new enrolment. |

## Known limitations

- Two-step verification is **TOTP only** (an app on the phone); SMS and e-mail codes are not used.
- For accounts that sign in through Microsoft, **our** second factor does not apply — access rules are configured
  in Microsoft.
- The local sign-in IP threshold is shared by users behind the same public IP address (for example, a shared
  proxy or NAT). The initial thresholds above still need staging measurement before production rollout.
- **Human verification** needs outbound internet access from the server *and* from the user's browser; on an
  installation without internet it stays off (`private.security.captcha.provider` on `none`). It is asked for per
  **IP address**, so behind a shared NAT a whole office gets it after five shared failures.
- **Recovery requires administrator help:** if a user loses the phone and all valid recovery codes, the way out
  goes through an administrator (**MFA reset**), with no self-service.

## Related modules

- Installation (the first SuperAdmin and the sign-in mode): `docs/user-guide/instalacija.md`
- Users and roles: **Users**, **Roles and permissions**
- Briefs: **T15**, **T18**, **T19**, **T20**, **T21**, **T22**
- Module analysis: `REVIEW_ANALIZA.md` §M2
