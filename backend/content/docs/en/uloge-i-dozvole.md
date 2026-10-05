
# Roles and permissions

## What this module is for

A short overview of who may do what in the application: which roles exist, what a **permission** and a **scope**
mean, and where access is changed. The detailed rules (impact preview, change log, read-only mode, limitations)
are in the guide `uloge-i-permisije.md`.

## Who it is for

**All users** — so they understand why they cannot see or perform an action. For administrators it is the entry
point into the full guide on permissions.

## How to get there

- **Your own permissions:** you see them through what the menu and the screens offer you; the full list arrives
  with the session.
- **The Permissions screen:** **Administration → Permissions** — available only to the **SUPER_ADMIN** account.
- **The full guide:** `uloge-i-permisije.md`.

## Step by step

1. A **role** grants basic access to screens and the menu (**USER**, **AGENT**, **ADMIN**, **SUPER_ADMIN**, plus
   the package roles **ASSET_MANAGER**, **PROBLEM_MANAGER**, **CHANGE_MANAGER**).
2. A **permission** is an individual grant for an action (e.g. `group.manage`, `settings.write`, `routing.write`,
   `ticket.merge`, `audit.export`). The system has **63** permissions.
3. Every assignment can carry an **OU scope** (organisational unit) and a **service scope** (service). The rule:
   *a permission never unlocks data outside its scope*.
4. If an action is not available to you, the usual reason is a missing permission (a role alone does not grant
   an action).
5. Administrators change the role → permission mapping on the **Permissions** screen, with **Impact preview**
   and **Confirm and save**.

## Fields, validations and statuses

| Role | Basics |
|---|---|
| **USER** | Submitting tickets, tracking own requests, replies, CSAT, knowledge base, service status, announcements. |
| **AGENT** | Group inbox and work on tickets inside their scope and group; templates, playbooks, group notifications. |
| **ADMIN** | Like an agent, plus the administration screens (users, OUs, groups, catalogue, SLA, routing, e-mail, reports) — according to the assigned permissions. |
| **SUPER_ADMIN** | Everything above, the **Permissions** screen, bypassing read-only mode by setting; the only role that changes the role → permission mapping. |
| **ASSET_MANAGER** | Assets: register, movements, transfer notes, licences, contracts (inside their scope). |
| **PROBLEM_MANAGER** | Problems: taking ownership, root-cause analysis, bulk resolution of linked tickets. |
| **CHANGE_MANAGER** | Changes: assessment, schedule, implementation, review and the CAB vote. |
| **Other users** | See the menu and screens according to their role and assigned permissions; some modules appear only when enabled. |

**Statuses and modes that affect access:** **read-only mode** locks a module for changes (mutating actions
return `403 READ_ONLY_MODE`); the **SuperAdmin bypass** applies only to the local (break-glass) account; a
**scoped assignment** does not satisfy a check without an OU scope (the exception is `oncall.read`).

## Frequent questions and errors

- **“Why do I not see an action although I have the role?”** — The role opens the menu, while actions require a
  permission; check under **Permissions** what the role actually has (or ask the SuperAdmin).
- **“Why was the action rejected with `READ_ONLY_MODE`?”** — Read-only mode is enabled for that module; the
  SuperAdmin turns it off, or the bypass is used.
- **“The SuperAdmin cannot sign in after a change.”** — The SuperAdmin account must be **local** (no AD/Entra
  link); a non-local one is rejected on purpose.
- **“The permission change is not visible immediately.”** — For new requests it is visible at once; the user may
  need to refresh the page to load the session again.
- **“I removed a permission from a role and later it is back.”** — The default mapping seed is **additive**: it
  never deletes, but restores what is missing (details in the guide).

## Known limitations

- **The Permissions screen is for SUPER_ADMIN only**; an ADMIN uses what is assigned but does not change the
  mapping.
- **The impact preview is not mandatory on the server** — the UI does not allow saving without a preview, but
  the API does not check it.
- **`group.manage` is checked without an OU scope**, so an OU-scoped ADMIN cannot manage groups.
- **The SuperAdmin bypass is not written to the audit log.**
- **There are 63 permissions** and the number grows with the modules; new permissions enter the roles only when
  the SuperAdmin saves them or applies a policy package.

## Related modules

- Full guide: `uloge-i-permisije.md` (RBAC, preview, change log, policy packages)
- Users, OUs and groups: `korisnici-oj-i-grupe.md`
- Policy packages: `policy-paketi.md`
- Frequent questions and error messages: `cesta-pitanja.md`
