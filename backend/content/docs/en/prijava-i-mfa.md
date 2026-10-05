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
3. After 5 failed attempts for the same e-mail within 15 minutes: “Too many failed sign-in attempts. Try again in
   15 minutes.” A successful sign-in resets the counter.

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

### Signing in with two-step verification enabled

1. After the correct password, **Two-step verification** is required.
2. Enter the **code from the app** and click **Confirm** (the code changes every 30 seconds).
3. If you have no phone, click **I have no access to the app — use a recovery code**, enter one of the saved codes
   and confirm. A recovery code works only once.
4. Every code (recovery ones included) can be used only once; the application checks that on the server too.

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
| Other users with a local password may enable two-step verification themselves | the permission for self-enrolment |
| The name the authenticator app shows next to the account | empty = the application name |
| Minimum length of a local password | 12–64 |
| Reject the most common passwords, the organisation name and parts of the user's own e-mail address (offline list) | on/off |
| Organisation words the password must not contain | comma-separated; the application name and internal domains are added |
| Number of previous passwords that must not be reused | 0 = no check |
| Local password expiry in days (except SUPER_ADMIN) | 0 = no expiry |
| Password expiry of the SUPER_ADMIN account in days | 0 = no expiry; default 365 |
| Maximum number of simultaneous sessions per user | 0 = no limit; exceeding it signs out the oldest |
| Notify ADMIN/SUPER_ADMIN about a sign-in from a new device or network | on/off |

## Fields, validations and statuses

| Field / status | Rule |
|---|---|
| E-mail | required, e-mail format |
| Password at sign-in | required; whether the e-mail exists is not revealed |
| New password | at least `private.auth.password.minLength` characters (12–64); must not equal the e-mail, contain the organisation name, part of the e-mail address, or be among the most common passwords; with history enabled, it must not repeat |
| Code from the app | 6 digits, ±30 s tolerance |
| Recovery code | the `xxxxx-xxxxx` format, single use |
| Sign-in statuses | `MUST_CHANGE_PASSWORD` (temporary/expired password), `MFA_REQUIRED` (enrolled second factor), `MFA_ENROLLMENT_REQUIRED` (required but not enrolled) |
| Intermediate step lifetime | password change 15 minutes, two-step verification 5 minutes |
| Session | 1 hour, extended while you work; an idle tab signs itself out |

## Frequent questions and errors

| Message / situation | What it means and what to do |
|---|---|
| “Sign-in failed. Check the e-mail and password.” | Wrong e-mail or password; it does not say which one. |
| “Too many failed sign-in attempts. Try again in 15 minutes.” | The counter is locked for that e-mail; wait or ask an administrator. |
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
- If an administrator turns off the setting “Other users with a local password may enable two-step verification
  themselves”, that also affects verification for users who already enrolled it (recorded as finding #1 in
  `REVIEW_ANALIZA.md` §M2).
- The failed-attempt counter is bound to the **e-mail and IP address**; behind a proxy it effectively comes down
  to the e-mail address.
- The forced password change screen shows “at least 12 characters” even when the policy is stricter; the server
  and the “Account security” page show the exact rule.
- **It is only user-friendly up to a point:** if a user loses the phone and the recovery codes, the way out goes
  through an administrator (**MFA reset**), with no self-service.

## Related modules

- Installation (the first SuperAdmin and the sign-in mode): `docs/user-guide/instalacija.md`
- Users and roles: **Users**, **Roles and permissions**
- Briefs: **T15**, **T18**, **T19**, **T20**, **T21**, **T22**
- Module analysis: `REVIEW_ANALIZA.md` §M2
