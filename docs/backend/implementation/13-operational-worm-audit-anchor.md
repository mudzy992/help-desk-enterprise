# Backend Val 3 / W3.4 — operativni remote/WORM audit anchor

## Status

**Završeno.** Implementacija je na SHA `3a0dd21`, a potpuno zeleni CI dokaz je `40135290452`.

Zatvoren je `BA-audit-log-03`: audit chain sada ima operativni, periodični, HMAC-potpisani anchor prema udaljenom create-only/WORM HTTP sinku, sa read-after-write provjerom, startup i readiness fail-closed granicom te metričkim stanjem laga i grešaka.

## Deployment key provider i konfiguracija

Runtime čita isključivo deployment environment vrijednosti:

- `AUDIT_ANCHOR_ENABLED`;
- `AUDIT_ANCHOR_WORM_URL`;
- `AUDIT_ANCHOR_HMAC_KEY` — najmanje 32 bajta;
- `AUDIT_ANCHOR_KEY_ID`;
- `AUDIT_ANCHOR_INTERVAL_MS`;
- `AUDIT_ANCHOR_MAX_LAG_MS`.

Ključ i key ID se ne čuvaju u bazi niti u anchor dokumentu kao tajna. Kada je feature uključen, nepotpuna konfiguracija obara application bootstrap umjesto degradacije na nepotpisani režim. Kada je eksplicitno isključen, postojeći development/test deploymenti ostaju spremni.

## Remote/WORM ugovor

Za svaki chain head publisher koristi jedinstveni URL `<base>/<chainHeadId>.json` i šalje:

- `PUT`;
- `If-None-Match: *` kao create-only precondition;
- potpisani canonical anchor dokument.

Sink mora odbiti overwrite postojećeg objekta. Nakon uspješnog PUT-a publisher radi uncached GET i poredi head ID, head hash i potpis sa poslanim dokumentom. Neuspješan PUT, read-back ili mismatch tretira se kao publish kvar; nema lažno zelenog stanja.

## Periodični publish i lifecycle

`AuditAnchorRuntimeService` je provider `AuditLogModule` i učitava se pri aplikacijskom bootstrapu. Kada je feature uključen:

1. validira deployment konfiguraciju;
2. odmah objavljuje aktuelni chain head;
3. tek nakon uspješnog početnog publisha pokreće periodični timer;
4. timer je `unref` i čisti se pri module shutdownu.

Početni sink kvar obara startup. Kasniji kvar povećava failure brojač i readiness ostaje crven sve dok naredni publish ne uspije.

## Readiness i metrike

`/health/ready` sada uz PostgreSQL i Redis uključuje `auditAnchor` check. Kada je anchor uključen, readiness je fail-closed za:

- nepostojeću/nepotpunu konfiguraciju;
- publish bez ijednog uspjeha;
- sink/read-back grešku prije oporavka;
- publish lag iznad `AUDIT_ANCHOR_MAX_LAG_MS`.

Runtime status izlaže `publishLagMs`, `publishFailuresTotal`, posljednji head ID i machine reason (`OK`, `MISSING_CONFIGURATION`, `PUBLISH_FAILED`, `STALE`). To je direktna metrička/alarm granica bez izlaganja ključa ili endpoint detalja u javnom health odgovoru.

## Fault/recovery dokaz

Izvršni test koristi udaljeni sink adapter sa kontrolisanim odgovorima i potvrđuje:

- create-only `If-None-Match: *` zahtjev;
- obavezni read-after-write GET;
- HTTP 503 postavlja readiness na crveno i povećava failure brojač;
- sljedeći uspješan publish vraća readiness na zeleno bez brisanja historijskog broja grešaka;
- prekoračen max lag vraća `STALE` i crvenu readiness odluku;
- nedostajući deployment ključ obara startup.

## Verifikacija

CI `40135290452` potpuno je zelen, uključujući backend build/lint/puni Jest, PostgreSQL/Redis integration, health probe ugovor, remote sink fault/recovery test, frontend, docs guard, container/supply-chain i završni CI gate.

## Granice paketa

Aplikacija ugovorno zahtijeva create-only udaljeni sink; stvarnu retention-lock/object-lock konfiguraciju konkretnog S3/WORM providera mora postaviti deployment platforma. Read-after-write i immutable-create precondition sprečavaju da običan mutable endpoint neprimjetno izgleda kao uspješan publish, ali infrastrukturni compliance dokaz providera ostaje deployment artefakt.

## Sljedeće

Sljedeći paket je **W3.5 — atomska privacy redakcija i authenticated redaction transition: objediniti metadata updatee, v4 rechain i završni `audit.redacted` događaj u jednu transakciju te dokazati rollback na mid-batch kvaru; zatvoriti `BA-audit-log-04`**.
