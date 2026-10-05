---
title: Getting started
slug: pocetak-rad
module: —
part: pocetak
audience: [All users, Agent, Administrator]
roles: []
order: 5
tags: [getting-started, sign-in, menu, ticket, notifications, help]
---

# Getting started

## What this module is for

The first steps in the application: how to sign in, what is where in the menu, how to open a ticket and where
its status is tracked. Every detail per module is covered by the dedicated pages this page points to.

## Who it is for

**All users**, especially new ones. For agents and administrators it works as a map of the menu and a reminder
of where each function lives.

## How to get there

- **Sign-in:** the `/login` address (or an automatic redirect when you open any page without a session).
- **Menu:** the left navigation rail, split into **Overview**, **Tickets**, **Services and knowledge** and
  **Administration** (the last part is visible only with an administrator role).
- **Command palette:** `Ctrl+K` or `/` — search and quick actions.
- **Help:** `?` opens the list of shortcuts that apply to the screen you are on.

## Step by step

1. **Sign in** with your e-mail and password. If **two-step verification** is enabled, enter the six-digit code
   from your authenticator app or a recovery code. Details: `prijava-i-mfa.md`.
2. **Look at the menu.** Under **Overview** are **Dashboard** and **Reports** (reports are visible only with the
   export permission). Under **Tickets** are **All tickets**, **Group inbox** (staff) and, when the modules are
   enabled, **Problems**, **Changes**, **Templates and playbooks** and **On-call**. Under **Services and
   knowledge** are **Service catalogue**, **Service status**, **Announcements**, **Knowledge base** and, when the
   module is enabled, **My assets** and **Assets**.
3. **Open a ticket:** the **New ticket** button (above the menu) or **Service catalogue** → pick a service →
   fill in the form. Details: `tiketi.md`, `katalog-usluga-i-forme.md`.
4. **Track a ticket:** **All tickets** → your ticket; there you see the status, messages, attachments and the due
   date (when SLA is enabled). You can reply from the ticket page itself.
5. **Notifications:** the bell in the header shows in-app notifications; channels and quiet hours are configured
   in your notification preferences. Details: `realtime-i-obavjestenja.md`.
6. **If you get stuck:** press `?` for shortcuts, `Ctrl+K` for the command palette, or look the term up in
   **Documentation** (menu → **Documentation**).

## Fields, validations and statuses

| Where | What you do there |
|---|---|
| **Dashboard** | counters and lists of the tickets you may open |
| **All tickets** | ticket list and search, opening details, creating a new ticket |
| **Group inbox** (staff) | tickets of the groups you belong to, and claiming |
| **Service catalogue** | choosing a service and the request form |
| **Service status** | service availability, planned maintenance and incidents |
| **Knowledge base** | articles and suggestions while creating a ticket |
| **Announcements** | organisation notices and read acknowledgement |
| **Documentation** | these guides, search and navigation by module |

**Validations you will notice immediately:** the password and two-step verification at sign-in; required fields
in the service form while creating a ticket; the due date (SLA) is shown on the ticket and cannot be shortened
by hand.

## Frequent questions and errors

- **“I cannot sign in.”** — Check the e-mail and password; after 5 failed attempts within 15 minutes, sign-in is
  locked for that e-mail. If two-step verification is enabled, the code from your app is required as well.
- **“Where do I see my tickets?”** — **All tickets** (the list follows your access) or **Dashboard**.
- **“How do I work faster?”** — `Ctrl+K` (command palette), `N` (new ticket), `G` then `T` (tickets),
  `?` (shortcut list). Details: `precice-i-pristupacnost.md`.
- **“I do not see part of the menu.”** — The menu adapts to your role and the enabled modules; administration,
  reports and some modules require a role or a permission.
- **“Where is the guide for a module?”** — Menu → **Documentation**, then pick the module in the left nav.

## Known limitations

- **The menu depends on the role and the enabled modules** — some entries (Problems, Changes, Assets, On-call,
  Templates) are visible only when the module and the permission are enabled.
- **Reports are not for everyone** — they require an administrator role and the export permission.
- **In-app documentation renders content from the repository** (`docs/user-guide/`); editing from within the
  application is not planned.

## Related modules

- Sign-in and two-step verification: `prijava-i-mfa.md`
- Tickets: `tiketi.md` · Service catalogue and forms: `katalog-usluga-i-forme.md`
- Notifications: `realtime-i-obavjestenja.md` · Shortcuts and accessibility: `precice-i-pristupacnost.md`
- Overview of all pages: `pregled-modula.md` · Glossary: `rjecnik.md`
