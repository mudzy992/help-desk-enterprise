---
title: Alarms and system health
slug: alarmi-i-zdravlje-sistema
module: —
part: administrator
audience: [SUPER_ADMIN, Administrator]
roles: [ADMIN, SUPER_ADMIN]
order: 120
tags: [alarms, system-health, monitoring, warning, critical, threshold, acknowledge, silence, security-metrics]
---
# Alarms and system health

> **Purpose:** this page explains what the alarms the application shows and sends mean, how they open and close,
> what an administrator does when one appears, and where the thresholds are changed. It is shown on
> **Administration → Operations and audit**.

## What this module is for

- **System health** shows the state of the components (worker, database, Redis, API), the scheduled jobs and
  queues, and the list of active alarms.
- An **alarm** is a clearly defined state that needs attention, for example the worker is down, the attachment
  disk is filling up, or there are too many failed sign-ins. Every alarm has a title, a short instruction on what to
  check first and a level: **warning** or **critical**.
- **Security metrics (last hour)** count blocked sign-ins (429), refused and skipped CAPTCHA checks, second-factor
  failures and skipped password checks. The numbers are aggregated and contain no personal data.

## Who it is for

- **Administrators** with the **ops.health.view** permission (viewing System health) and with the
  **ops.alerts.manage** permission (acknowledging and silencing alarms, sending a test alarm).
- **SUPER_ADMIN** sees everything, including the **Security metrics** card.
- Alarm recipients are users with the **ops.alerts.receive** permission and the extra addresses in the settings.

## How to get there

- **Administration → Operations and audit** — the **System health** card (components, scheduled jobs, queues,
  active alarms) and the **Security metrics (last hour)** card (SUPER_ADMIN only).
- **Settings → Operations** — alarm channels (`private.ops.alerts.*`) and thresholds (`private.ops.thresholds.*`).

## Step by step

### How an alarm opens and closes

1. The application checks the state **every minute**.
2. An alarm **opens** only when the condition lasts for two consecutive checks (for some alarms — *SLA scan is
   late*, *Failed jobs in the queue (DLQ)*, *Outbound e-mail is paused* — one check is enough). This avoids false
   alarms from a single bad moment.
3. An alarm **closes** when the condition is gone for two consecutive checks.
4. While an alarm is open, recipients get a **reminder** every **4 hours** (default; adjustable from 1 to 48 hours in
   `private.ops.alerts.reminderHours`) until someone acknowledges it.

### What to do when an alarm appears

1. Open **System health** and click the alarm. The instruction under its title says what to check first.
2. If you are working on the problem, click **I am taking it** (acknowledge). The name and time are recorded, and the
   reminders stop.
3. If planned work is under way, use **Silence alarms**: enter a duration and a reason (required). Checks and history
   keep running, but messages are not sent. The action is written to the audit log.
4. When the cause is fixed, the alarm closes by itself once the state is back to normal.

### Checking the alarm channels

**Send test alarm** sends a message to all configured channels and shows the outcome per channel. If a channel did not
deliver, the outcome gives the reason: there are no recipients (the **ops.alerts.receive** permission or an extra
address is missing), the channel is not configured, or the e-mail channel is switched off in the settings.

### Security alarms

Three alarms come from the security metric counters. The counter covers the last hour, and the alarm opens when the
**number reaches the threshold** (not only when it is exceeded). A fourth alarm, for the webhook export, does not count
events: it measures how long the export has not been delivering (see the last row of the table):

| Alarm | What it means | Warning from | Critical from | First step |
|---|---|---|---|---|
| **Blocked sign-ins (429) exceed the threshold** | Many sign-ins were blocked after failed attempts. | 50 per hour | 200 per hour | Check the metrics, the source in the 429 answer (`Retry-After`), and if needed `ipMaxFailures` / `ipWindowSeconds`. If the source is a NAT or proxy, raise the threshold or allow-list the source on the network. If it is password guessing, block the source. |
| **CAPTCHA challenges are often refused** | The client sends solutions Cloudflare does not accept: expired solutions, a wrong site key or an automated client. | 50 per hour | 200 per hour | Check the sign-in metadata in the security journal and the **Security metrics** card. If the counts grow without real users, it is an automated client. Do not lower the threshold without analysis. |
| **CAPTCHA checks are skipped (Cloudflare unreachable)** | The server cannot ask Cloudflare Turnstile (timeout, network or a failed answer), so sign-ins pass on the rate limits alone. | 50 per hour | 200 per hour | Check the server's outbound access to Cloudflare. If the installation has no internet access by design, switch the CAPTCHA provider back to `none`. |
| **Security audit webhook export is not delivering** | The receiver does not accept events (the answer is not 2xx, the deadline passed or there is no connection). | 15 min without success | 60 min without success | Check the address and the receiver from the server, then the **Audit webhook export** tile on the **Security metrics** card (last error). |

The webhook alarm does not read the “switched on” setting: when you switch the export off, the waiting time is cleared and the alarm closes by the rule in “How an alarm opens and closes”. The 15 and 60 minute thresholds are fixed.

Details about the CAPTCHA check are on the page [Human verification (CAPTCHA)](captcha-provjera.md).

### When outbound e-mail stops (provider limit)

If the SMTP provider refuses sending because of its quota (for example Gmail “Daily user sending limit exceeded”),
the application **pauses outbound e-mail temporarily** and opens the alarm **Outbound e-mail is paused (provider
limit)**:

- The alarm details show how many minutes are left until the next attempt and how many sends were held back.
  Messages are not lost: they wait in the queue and go out as soon as the provider accepts mail again.
- The pause lasts as long as the provider quota does (with a daily limit usually up to 6 hours). The alarm becomes
  **critical** after 4 hours without an accepted message.
- Repeating the same messages by hand does not help — every new refusal extends the pause.
- The permanent fix is a higher daily limit, a second SMTP account or less mail per event (digests and the weekly
  report instead of single notifications).

### Where the thresholds are changed

Thresholds are in **Settings → Operations**:

- `private.ops.thresholds.login429WarnPerHour` and `…login429CriticalPerHour` — blocked sign-ins (default 50 and 200);
- `private.ops.thresholds.captchaFailedWarnPerHour` and `…captchaFailedCriticalPerHour` — refused CAPTCHA checks
  (default 50 and 200);
- `private.ops.thresholds.captchaSkippedWarnPerHour` and `…captchaSkippedCriticalPerHour` — skipped CAPTCHA checks
  (default 50 and 200).

A warning threshold can be set from 1 upwards, and a critical one from 2 upwards. Change a threshold only on the
basis of measurements in the **Security metrics** card, not in advance.

## Fields, validations and statuses

| Term | Meaning |
|---|---|
| **Warning** | The condition is present but not critical. It goes to the recipients like a critical alarm. |
| **Critical** | The counter has reached the critical threshold. It needs an immediate response. |
| **Acknowledged** | Someone has taken the alarm; the reminders are stopped. The name and time are shown. |
| **Silenced** | Sending messages is paused for a while (for example for planned work) with a required reason. |
| **Reminder** | A repeated message while the alarm is open and not acknowledged (default every 4 hours). |

## Frequently asked questions and errors

- **“The alarm is open, but I did not get a message.”** — Run **Send test alarm**. The outcome says whether a recipient,
  a channel is missing, or the e-mail channel is switched off.
- **“I see an alarm, but there is nothing to do.”** — The alarm closes by itself when the condition is back to normal.
  If it stays open, check the **System health** card and the instruction next to the alarm.
- **“The 429 alarm keeps firing from the same office.”** — Many users behind one IP address (NAT) are counted
  together. See the instruction next to the alarm; do not relax the threshold without checking the source.
- **“Users do not get e-mail although the application works.”** — Check whether the alarm *Outbound e-mail is paused
  (provider limit)* is open: the SMTP provider has then used up its quota and sending is paused temporarily.
- **“I cannot see the Security metrics card.”** — The card is for SUPER_ADMIN only.

## Known limitations

- Security alarms work on hourly counters, so they react with a delay of up to one minute and do not show single attempts.
- Security metrics count events per IP address, not per account.
- Reminders are sent only while an alarm is open and not acknowledged.
- The number of held-back sends in the outbound e-mail alarm details is approximate (it is counted per process, not
  per message).

## Related modules

- [Human verification (CAPTCHA)](captcha-provjera.md) — switching the check on and its alarms.
- [Export of the security journal to a webhook](webhook-izvoz-dnevnika.md) — sending security events to an external system.
- [Sign-in and two-step verification (MFA)](prijava-i-mfa.md) — what the user sees when a sign-in is blocked.
- [Roles and permissions (RBAC)](uloge-i-permisije.md) — rights to view and manage alarms.
