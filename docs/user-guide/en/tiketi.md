---
title: Tickets
slug: tiketi
module: M8
part: korisnik
audience: [User, Agent, Administrator]
roles: []
order: 10
tags: [tickets, statuses, attachments, bulk-actions, confidential-tickets, saved-views]
---
# Tickets

> **Purpose:** a ticket is the basic unit of work — from submitting a request, through claiming it in a group and
> handling it, all the way to resolution, closure and the archive. This guide describes the whole flow: creation,
> lists and views, the ticket detail, statuses, merging and splitting, bulk actions, saved views, time tracking and
> attachments.

## What this module is for

- **Submitting a ticket** goes through a service and its form; the system determines the **handler group** itself
  (see *Routing and priority*) and the **priority** from impact and urgency.
- The **group inbox** is the work queue of a group: a ticket stays in the group until an agent **claims** it.
- The **status flow** is predefined; disallowed transitions are rejected, and closing requires a close code, a
  resolution note and the required fields.
- **Merging** folds duplicates into one parent ticket, and **splitting** creates 2–10 sub-tickets when one request
  covers several topics.
- **Bulk actions** work only inside the same OU and group, never closing, with a preview and a limit for the
  broadcast.
- **Time tracking** records work on a ticket, with an automatic pause when there is no activity.

## Who it is for

| Role | What they can do |
|---|---|
| **User** | Submits tickets, tracks own requests, replies in messages, rates (CSAT), reopens within the deadline. |
| **Agent** | Sees the group inbox and the tickets inside their OU/service scope and their group's tickets; claims, changes the status, adds messages, participants and attachments, tracks time, merges/splits and runs bulk actions in their group. |
| **ADMIN** | Everything an agent can, plus bulk actions and export; configures the module rules in the settings. |
| **SUPER_ADMIN** | Everything above, including bulk actions across OU boundaries (when the setting is enabled). |

Visibility is not a matter of agreement: the OU/service scope, membership in the current handler group,
participation and the confidential-ticket rules decide who sees what (a SuperAdmin does **not** automatically get
access to confidential tickets).

## How to get there

1. **Ticket list:** the **Tickets** section → **All tickets** (the views are in the list header).
2. **Group inbox:** the **Tickets** section → **Group inbox** (or the **Group inbox** tab in the list).
3. **Submitting a ticket:** the **Submit a ticket** button (or **New ticket**) → `/tickets/new`.
4. **Ticket detail:** click a row in the list or the ticket number.

## Step by step

### 1. Submitting a ticket (user)

1. Open **Submit a ticket**.
2. Pick the **service**; the service form loads automatically (see *Service catalogue and forms*).
3. Fill in the **title**, the **description**, the **impact** and the **urgency**, plus the form fields. If a
   similar ticket exists, the system shows a **duplicate warning** and asks for confirmation.
4. Review the summary (priority, routing outcome, approvals, SLA) and send it.
5. The ticket gets a number (`T-000001`), a group and a status — **Pending** or **Unrouted**.

### 2. Working from the group inbox (agent)

1. Open the **Group inbox** and the tab of your group.
2. Click **Claim** on a ticket — the ticket moves to **Assigned** and is bound to you.
3. If a ticket has no group, you will see the **Unrouted queue** tab and the shortcut **Create a rule for this
   combination**.

### 3. Working in the ticket detail

1. **Status change:** pick a new status in the header and (when asked) fill in the required fields, the close code
   and the **resolution note**.
2. **Messages:** write in the composer; you choose the message type (a public reply or an internal note, depending
   on the settings).
3. **Participants:** add people with a role (e.g. a colleague involved in the problem); a **follower** does not get
   access to the ticket.
4. **Attachments:** drag a file in or pick one; the formats from the attachment policy are allowed (by default
   PDF, PNG, JPG/JPEG, DOCX, XLSX, up to 25 MB).
5. **Time:** start the timer (**Start**) and stop it when you finish; the timer pauses itself after inactivity.
6. **Priority:** the **Change priority** button (see *Routing and priority*).

### 4. Merging and unmerging

1. On the ticket (parent) open the **Merge** action.
2. Pick up to 10 candidates (or up to 50 tickets in total) and write the **reason** (3–500 characters).
3. The children are redirected to the parent ticket: messages and status follow the parent, and the children become
   **read-only**.
4. **Unmerge** returns an individual child as a standalone ticket.

### 5. Splitting a ticket

1. On the ticket open the **Split ticket** action.
2. Add 2–10 children: title, description, service and group as needed.
3. Choose the messages and attachments that are carried over (if you pick none, the child gets only a reference).
4. Write the **reason** and confirm — a system record with the list of created children appears in the ticket.

### 6. Bulk actions (agent/admin)

1. In the list, tick the tickets (up to 100).
2. Open the bulk actions panel and pick an action: **Assign a group/agent**, **Change the status**, **Change the
   priority**, **Notify (broadcast)** or **Merge into a parent**.
3. For a broadcast fill in the structured fields (**what is happening**, **who is affected**, **ETA**, optionally a
   **workaround**); the **number of recipients** is shown and the sending limit is respected.
4. Write the reason (up to 2000 characters) and confirm. **Closing tickets in bulk is not allowed.**

### 7. Saved views

1. Set the filters, the sort and the columns in the list.
2. Open the saved views menu → **Save view**, type a name.
3. You can mark a view as the **default** one; only you see them (sharing is not enabled).

## Fields, validations and statuses

### Ticket

| Field | Rule |
|---|---|
| Title | required, up to 200 characters |
| Description | required, up to 8000 characters |
| Impact / Urgency | required, a choice of: Low, Medium, High, Critical |
| Service | required; the service must be active and have an active form |
| Confidential | a switch (it can also be the default per service) |
| Attachment | the policy: types, extensions, size, the number per ticket and per message |

### Statuses and allowed transitions

| Status | Meaning | Typical transitions |
|---|---|---|
| **Pending** (`PENDING`) | in the group, waiting to be claimed | → Assigned, In progress, Pending approval (system), Closed |
| **Unrouted** (`UNROUTED`) | no handler group | → Pending (by forwarding), Closed |
| **Pending approval** (`PENDING_APPROVAL`) | waiting for the approvers' decision | → Pending or Closed (by the decision) |
| **Assigned** (`ASSIGNED`) | claimed | → In progress, Pending, Waiting for user, Closed |
| **In progress** (`IN_PROGRESS`) | actively worked on | → Waiting for user, Resolved, Assigned |
| **Waiting for user** (`WAITING_FOR_USER`) | waiting for an answer | → In progress, Resolved, Closed (automation) |
| **Resolved** (`RESOLVED`) | resolved, awaiting confirmation | → Closed, In progress (reopen) |
| **Closed** (`CLOSED`) | finished | → Archived (automation), In progress (reopen) |
| **Archived** (`ARCHIVED`) | archive | read-only |

### Automation and deadlines

| Rule | Default |
|---|---|
| Reminder while a ticket waits for the user | 2 days |
| Automatic closure while a ticket waits for the user | 7 days |
| Reopening | allowed 7 days after resolution/closure |
| Archiving closed tickets | 30 days |
| Check schedule | the archive and waiting-for-user every 15 minutes |

### Messages and attachments

| Element | Rule |
|---|---|
| Message types | a public reply and an internal note (depending on the settings) |
| Participants | roles; a **follower** does not get access to the ticket |
| Attachments | up to 25 MB, the types/extensions allowed by the policy; dangerous extensions are rejected |
| Attachment classification | inherited from the ticket; “lowering” the classification is forbidden |

### Bulk actions, export and time tracking

| Element | Rule |
|---|---|
| Bulk action scope | up to 100 tickets, the same OU **and** group (a SuperAdmin may cross OUs when enabled) |
| Closing | **not allowed** in bulk |
| Broadcast | structured fields required, a recipient preview, a sending limit |
| Export | CSV, up to 5000 rows |
| Timer | one active per user, an automatic pause after inactivity, a session length limit |

## Frequent questions and errors

- **“I cannot find a ticket in the list.”** — Visibility depends on the OU/service, membership in the handler group
  and confidentiality; a user in the group inbox sees only their group's work queue (own tickets are under **My
  requests**).
- **“Claiming is not possible.”** — The ticket is not in your group or is already claimed; claiming guards against
  simultaneous claims.
- **“The status transition is not allowed.”** — The status flow is predefined (the table above); some transitions
  are done only by the system or an approver.
- **“Closing asks for a close code / a note / extra fields.”** — The close code, the resolution note, the global
  and per-service required fields and (optionally) the required fields from the service form are checked.
- **“The ticket is locked for changes.”** — The ticket is **merged** as a child or **archived** (read-only).
- **“The tickets cannot be merged.”** — One of the tickets is closed/archived, the confidentiality differs, or a
  limit is exceeded (10 candidates / 50 children).
- **“The bulk action was rejected.”** — The tickets are not in the same OU and group, the action is not on the
  allowed list, or it is a closure (which bulk mode does not allow).
- **“The broadcast was rejected.”** — The required fields are missing (**what is happening**, **who is affected**,
  **ETA**) or the sending limit was reached.
- **“Reopening is not possible.”** — The deadline passed (7 days by default) or the feature is disabled; in some
  cases the system opens a **new** ticket linked to the original.
- **“The attachment was rejected.”** — The type/extension is not on the allowed list, the file is larger than
  25 MB, the number of attachments is exceeded, or the scan flagged the file.

## Known limitations

- **The attachment retention policy is owned solely by the Privacy module** (the *Attachments* category). The
  *Attachment retention* setting in the Tickets module is marked **outdated and without effect** and deletes
  nothing — if you need it, enable the category in **Personal data protection → retention**. (Finding B1 of §M8 —
  closed in wave 2.)
- **The “First response” column** is filled on the first agent reply and does not depend on the SLA module.
- **The broadcast sending limit lives in Redis**, per user and minute, so it applies across instances; if Redis is
  unavailable, the limit is still enforced locally. (Finding B2 — closed in wave 3.)
- **Sharing saved views does not exist**: views are always personal, and the unused `allowSharing` setting has been
  removed. (Finding B3 — closed in wave 5.)
- **The list shows merged children by default** until the **Hide merged** filter is enabled. (Finding B4.)
- **The total ticket count in the list may lag up to 30 seconds** (the count is briefly cached for performance);
  the rows are always fresh. (Finding B5.)
- **The reopen button does not follow the** `reopen.enabled` **setting** in the list of allowed actions — the
  server rejects the request when the feature is disabled. (Finding B7.)
- **The “request type” and “due date” fields** from the project brief do not exist as separate ticket fields; the
  request type is carried by the service and its form.

## Related modules

- **Service catalogue and forms** — the service, the form and the version the ticket was created with.
- **Routing and priority** — which group receives the ticket and how the priority is computed.
- **Ticket forwarding** — changing the group with a reason and the forwarding history.
- **Approvals and CSAT** — the approval steps before handling and the satisfaction rating.
- **SLA** — the response and resolution deadlines per priority.
- **Privacy** — retention and deletion of ticket content and attachments.
- **Templates and playbooks** — prepared replies and handling steps.
- **Knowledge base** — suggested articles while creating a ticket.

---

*Updated: 2026-10-05 · Module: Tickets (M8)*
