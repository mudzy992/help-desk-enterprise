---
title: Frequently asked questions
slug: cesta-pitanja
module: —
part: referenca
audience: [All users, Agent, Administrator]
roles: []
order: 20
tags: [faq, frequent-questions, errors, messages, help]
---

# Frequently asked questions

## What this module is for

A collection of the most frequent questions and error messages from all the guides, in one place. Each question
links to the module page holding the detailed explanation; only the shortest answers are here.

## Who it is for

**All users**, agents and administrators as the first step before asking for help. Some questions concern
administration and therefore point to a module page (e.g. `uloge-i-permisije.md`) intended for administrators.

## How to get there

- **Documentation → Reference → Frequently asked questions.**
- **Search:** the search field in Documentation also searches this page; for a term from an error message type a
  part of it (e.g. “The code is not valid”).

## Step by step

1. Find your question in the section of your module below (the sections follow the guides).
2. If the answer points to details, open the `[guide]` link in the section heading.
3. If the question is not here, open the module page and its **Frequent questions and errors** section, or search
   the whole Documentation.
4. If there is no answer there either, open a ticket in the category matching the problem (for access issues:
   **Users**/IT support).

## Fields, validations and statuses

**How to read the answers:**

| Mark in the text | Meaning |
|---|---|
| **Bold** | the name of a button, screen or field exactly as it appears in the application |
| `code` | a technical error code or setting key (for administrators) |
| *Italic* | the name of a setting or a menu screen |

**Error messages** are quoted as the application shows them; the codes in brackets (e.g. `403`, `SETUP_REQUIRED`)
are the technical mark for the administrator.

## Frequent questions and errors

### Sign-in and two-step verification (MFA) ([guide](prijava-i-mfa.md))

- **“The code is not valid or has already been used.”** — The code expired, was mistyped or was already used; wait for a new code or use a recovery code.
- **“The sign-in step expired (valid for 5 minutes).”** — You waited too long on the code screen; go back to sign-in and repeat.
- **“I have no recovery codes left.”** — An administrator can do an **MFA reset**, after which you enrol the second factor again.

### Keyboard shortcuts and accessibility ([guide](precice-i-pristupacnost.md))

- **“A shortcut does not work.”** — Check three things: whether the focus is in a field or a dialogue is open (single-letter shortcuts do not work then), whether the single-letter shortcuts are enabled, and whether the shortcut applies to your role on that screen.
- **“A shortcut changes nothing.”** — If the button is not available (e.g. the ticket was already claimed), the shortcut does not change the state and briefly announces the reason.
- **“`]` does not move to the next page of the list.”** — At the end of a page the application announces “End of list page”; go back to the list (`U`), move to the next page and continue.

### Tickets ([guide](tiketi.md))

- **“I cannot find a ticket in the list.”** — Visibility depends on the OU/service, membership in the handler group and confidentiality; a user in the group inbox sees only their group's work queue (own tickets are under **My requests**).
- **“Claiming is not possible.”** — The ticket is not in your group or is already claimed; claiming guards against simultaneous claims.
- **“The status transition is not allowed.”** — The status flow is predefined (the transition table is in the guide); some transitions are done only by the system or an approver.

### Approvals and CSAT ([guide](odobrenja-i-csat.md))

- **“I cannot approve a ticket.”** — Possible reasons: you are the requester, you do not have the approver role, the ticket is outside your OU/service scope, or the ticket is no longer in the **Pending approval** status.
- **“The Approve/Reject buttons are inactive.”** — The **decision reason** is required; type it and the buttons become active.
- **“The ticket was closed although I never resolved it.”** — The approval was **rejected**; the ticket status is **Closed**, and the rejection reason sits in the **Approvals** panel.

### Service status: incident or planned interruption? ([guide](status-incidenti-i-planirani-prekidi.md))

- **“We scheduled maintenance for Saturday — does that go in as an incident?”** — No. If it is known in advance, it goes through **Schedule an interruption** (the comparison is in the guide).
- **“Why is an incident with the impact ‘Maintenance’ not in the incident history?”** — Because it is meant for urgent, unannounced maintenance; anything that can be announced goes through **Schedule an interruption**.
- **“Why is the service shown as Maintenance although I did not change the status?”** — While a planned interruption is running, the service is shown as **Maintenance** if the automatic maintenance status is enabled in the settings.

### Knowledge base ([guide](baza-znanja.md))

- **“Why can I not see an article my colleague sees?”** — Classification and scope decide: a published `INTERNAL` article is visible to every signed-in user, `CONFIDENTIAL` requires staff inside the OU and service scope, and `RESTRICTED` only an ADMIN inside that scope; unpublished ones are visible to the owner, the reviewer and people with the permission.
- **“Why is my article marked as outdated?”** — The review deadline passed, or more than “Days until outdated” elapsed since the last review. A reviewer moves the deadline and clears the mark by clicking **Approve review**.
- **“I cannot publish an article.”** — Publishing requires a prior review: first **Submit for review**, then **Approve review**.

### Announcements ([guide](najave.md))

- **“I closed an announcement — why is it gone?”** — **Close** hides an announcement without acknowledgement and it is no longer shown; if you want it later, open it from the **Announcements** menu.
- **“The window comes back although I closed it.”** — The window returns on the next navigation at most **3 times per sign-in**; after that only the banner remains. For announcements with acknowledgement the banner stays until you acknowledge.
- **“I did not get an announcement e-mail.”** — Check your notification preferences: e-mail turned off for “Announcements”, a digest or quiet hours mean that e-mail is sent only for **critical** announcements, and you see the rest in the application.

### Realtime and notifications ([guide](realtime-i-obavjestenja.md))

- **“The bell shows nothing although I know a ticket changed.”** — Check whether you are a member of the group the ticket belongs to and whether you turned off notifications of that type in your preferences; an internal notification arrives only if you were mentioned.
- **“A notification arrived in one tab but not in another.”** — Counting is per **group**, not per user: if a notification is a group one and you are in that group, you will see it once; personal notifications arrive in all your open tabs.
- **“Clicking a notification does not open the ticket.”** — You may no longer have access to that ticket (changed scope, confidentiality or assignment); the ticket then opens as “no access”.

### Service catalogue and forms ([guide](katalog-usluga-i-forme.md))

- **“Why do users not see a service?”** — The service must be **Active**; the transition to Active is rejected with `409 NO_ACTIVE_FORM_VERSION` unless an active form version exists. During ticket submission, form display and version requirements depend on `private.ticket.forms.enabled` and `private.ticket.forms.versioning.requireVersionOnTicket`.
- **“A field is marked required, yet the ticket passed without it.”** — The server validates form data on ticket creation and update; closing/resolving separately checks the close code, resolution note and workflow-required fields.
- **“I cannot save a field change.”** — The version is active or already has tickets; create a **New version from the selected one** and change the draft.

### E-mail ([guide](posta.md))

- **“I did not get an e-mail although I see an in-app notification.”** — Check: whether SMTP is enabled, whether notification sending is enabled, whether your domain is on the allow list, and whether you turned e-mail off in “My profile” or enabled a digest/quiet hours.
- **“The e-mail has no button to open the ticket.”** — The public application URL is not set; without it the links are omitted on purpose.
- **“I replied, but the reply is not on the ticket.”** — The reply must go to the Reply-To address of the shared mailbox (the “shared mailbox” mode); check the inbound mail log as well — the message is probably under “rejected” with a reason.

### Assets (CMDB) ([guide](imovina.md))

- **“Why can I not see a colleague's equipment?”** — A user sees only the equipment assigned to them; an asset manager sees the equipment of their organisational units. The register does not show someone else's equipment either.
- **“How do I report a problem with equipment?”** — **“Report a problem”** on an entry in *My assets*, or the field “Which asset is this about?” on the **New ticket** form. The ticket goes to the group in charge of that asset (for types with a defined group).
- **“A transfer note was issued by mistake.”** — Cancel it with a reason; the correction is a **new movement** (a new number).

## Known limitations

- **This page does not replace the module pages** — it holds the shortest answers; the complete rules, fields and
  limitations are on the module page.
- **The questions are taken from the guides at generation time**; if an answer in a guide changed, the version
  from the guide appears here (the module page is always the source).
- **Administration questions** (e.g. about permissions, SLA rules, asset import) require access to those screens;
  if you do not have access, contact an administrator.

## Related modules

- Overview of all pages: `pregled-modula.md`
- Glossary: `rjecnik.md`
- Roles and permissions (what each role may do): `uloge-i-dozvole.md`
