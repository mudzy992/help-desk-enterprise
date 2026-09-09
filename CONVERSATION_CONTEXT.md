# Conversation context (EPHelpDesk) — import u novi chat

Ovaj fajl postoji samo da bi se **lako prenio kontekst** u novi Cursor chat u novom workspace-u.

## Kako ga koristiti

1) U novom workspace-u (`ephelpdesk-enterprise`) otvori novi chat.  
2) Dodaj ovaj fajl kao kontekst (Add context → File) ili ga samo otvori i reci agentu: “koristi `CONVERSATION_CONTEXT.md` kao kontekst”.

## Zašto ne radi “link” `eeace9c2-8d83-4a52-bec2-76b959cc9bb9`

To nije web link nego **interni ID transkripta** iz prethodnog workspace-a. U novom chatu se često ne može “resolve-ovati” kao link.
Ako baš želiš originalni transcript fajl, nalazi se na disku ovdje:

`C:\Users\m.ceric\.cursor\projects\c-Users-m-ceric-Documents-GitHub-cursor-master-template\agent-transcripts\eeace9c2-8d83-4a52-bec2-76b959cc9bb9\eeace9c2-8d83-4a52-bec2-76b959cc9bb9.jsonl`

## Trenutni source-of-truth deliverable

- `RAW_PROJECT_EPHELPDESK.md` je glavni “enterprise” RAW projekat (najbitnije odluke su tu).
- Dodatni dokumenti:
  - `EPBIH_START_INPUTS.md`
  - `EPBIH_IT_EMAIL_CHECKLIST.md`
  - `EPBIH_SYSADMIN_AD_MIN_EMAIL.md`

## Ključne odluke (sažetak)

- **Tech baseline**: Backend NestJS + TS strict + Prisma 7 + MySQL/MariaDB; Frontend React (Vite) + TS + Tailwind + shadcn/Radix.
- **Mobile**: **nema mobilne aplikacije** za ovaj projekat (sve reference uklonjene iz RAW-a).
- **Realtime**: Socket.IO opt-in, ali obavezno za notifications + settings refresh + ticket updates/chat.
- **Auth (kasnije)**: AD/LDAPS + Entra SSO je planirano, ali u implementaciji prvo **lokalni dev useri** koji moraju prolaziti identične tokove i permission checkove kao “AD user”.
- **AD dev read**: u dev se može privremeno koristiti lični AD user za read, uz throttling/caching i “manual_only” sync (definisano u RAW-u).
- **OU source-of-truth**: `DistinguishedName` / OU path; standard:
  - `OU=Korisnici,DC=epbih,DC=ba` (users)
  - `OU=Grupe,DC=epbih,DC=ba` (groups)
  - top-level: `OU=Direkcija` i `OU=ED <grad>`; pod ED: poslovnice (npr. Breza/Visoko).
- **Service catalog + forms**: 1:1 servis → schema-driven forma + **form versioning**.
- **Approval flow**: ITIL-lite, settings-driven.
- **Unrouted queue**: enable + owner + cleanup SLA.
- **Attachments**: hardened policy bez AV; limit 25MB; allow-list mime types; data classification utiče na attachment rules.
- **SLA engine**: “professional”, BH calendars, profiles, pause rules, overdue + escalations (in-app).
- **RBAC**: granular permissions + permission scopes (OU/Service); default mapping role→permissions.
- **Confidential tickets**: per-ticket restricted visibility (HR/Finance/Legal), safe logging mode, audit.
- **Notifications**: in-app obavezno; email interno-only; Edge extension interni dodatak za `epbih.ba`.
- **Ops/Quality**: config versioning + rollback + dry-run/validate + shadow mode; audit export (light tamper-evident); report packs; maintenance banner global/per-service (non-blocking).

## Šta je sljedeće

Nastavak je “Plan mode za implementaciju” u ovom repo-u, bazirano na `RAW_PROJECT_EPHELPDESK.md`.

