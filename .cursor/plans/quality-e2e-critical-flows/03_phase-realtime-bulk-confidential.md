# Faza 3 — Tokovi 4–6

## 4. Realtime / notifications / durable queue — `e2e/tests/04-realtime-notifications.spec.ts`

Preduslov setup: `private.smtp.enabled`, `private.addons.email`, `private.notifications.email.enabled`, `private.notifications.email.internalOnly=true`, `private.addons.edge`, `private.integrations.queue.enabled`, `typesCsv` uključuje `email,edge`.

1. **In-app:** akcija koja fan-out-uje (create/assign). UI inbox notifikacija i/ili `GET /notifications`.
2. **Email internal-only:** primalac `@epbih.ba` → `GET /integration-jobs` ima `EMAIL` job za taj event. Ako postoji nalog van `@epbih.ba`, **nema** EMAIL joba za njega (internal-only).
3. **Edge kroz queue:** isti fan-out → `EDGE_EVENT` red u `IntegrationJob` (F7-A). Nije test Edge popup-a.

Socket.IO: opciono `page.waitForResponse` / UI refresh; ne mockovati gateway.

## 5. Bulk broadcast — `e2e/tests/05-bulk-broadcast.spec.ts`

Lista tiketa + `ticket-bulk-bar`:

1. Structured required fields (settings CSV) — submit bez polja → validaciona greška.
2. Preview `POST /tickets/bulk/preview` prije send (`broadcastRequirePreview`).
3. Rate limit: drugi broadcast unutar `broadcastRateLimitPerMinute` → očekivani error code (ne mijenjati guardrail logiku).

Ne testirati bulk close (zabranjen).

## 6. Confidential — `e2e/tests/06-confidential.spec.ts`

Zavisi od odluke A (drugi nalog).

1. SuperAdmin kreira `isConfidential` tiket.
2. USER bez ACL: lista `/tickets`, search, `GET /tickets/:id` — nema naslova/opisa; 403 `CONFIDENTIAL_ACCESS_DENIED`.
3. Isti USER **ne** smije break-glass ako nije u `breakGlassAllowedRolesCsv` (default `SUPER_ADMIN`).
4. SuperAdmin (allow-list): `POST /tickets/:id/break-glass` `{ reason }` → detalj vidljiv; ChangeLog/SYSTEM_EVENT `ticket_confidential_break_glass` bez sadržaja tiketa.

Search = postojeći list filter, ne AI.
