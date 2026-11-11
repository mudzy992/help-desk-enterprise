# BA-announcements-20: realtime prikaz najava već prijavljenim korisnicima

Status: **zatvoreno** (2026-10-29) operativnom potvrdom vlasnika (R1/R2/R3 = DA; R3 nestanak preko poll fallbacka kako je dokumentovano) uz CI `43040740316` success; vidi audit 28 §29. Vlasnikov zahtjev: najava s uključenom trakom (BANNER) ili dijalogom (MODAL) mora se korisniku koji je već prijavljen prikazati čim nastupi, bez ručnog osvježavanja aplikacije; u suprotnom najava može završiti a da je korisnik nikad ne vidi (osim e-maila). Prije ove izmjene `AnnouncementsHost` je aktivnu listu osvježavao poliranjem svakih 60 s, a modal se odlučivao samo jednom pri mountu.

## Izmjena

Bez migracije. Ponovo se koristi postojeća websocket infrastruktura (`TicketRealtimeHub`, Redis bridge worker→API, `user:<id>` sobe, `acquireHelpdeskSocket`):

- **Backend signal.** `AnnouncementsService.fanOut` — isti prolaz koji upisuje inbox notifikaciju publike na početku/reminderu — po svakom stvarno kreiranom zapisu (dedupe pogodak ne emituje) objavljuje `publishAnnouncementChanged({ userId, announcementId, occurredAt })`. Payload je **content-free**: bez naslova, tijela i severity-ja; klijent njime samo invalidira vlastiti upit.
- **Hub/bridge.** Novi kanal na `TicketRealtimeHub` (`subscribeAnnouncementChanged`/`publishAnnouncementChanged` + awaited varijanta radi forwarder retry semantike), novi bridge kind `announcement-changed` (parser validira `userId` + `announcementId`), forwarder ga prosljeđuje preko postojećeg `tickets:realtime-bridge` Redis kanala, API subscriber ga vraća u hub, a gateway emituje `announcement.changed` u `user:<id>` sobu (`broadcastAnnouncementChanged`). Socket event ime: `announcement.changed` (`ticketRealtimeEventNames.announcementChanged`).
- **Moduli.** `AnnouncementsService` prima hub kao opcionalnu zavisnost (postojeće unit konstrukcije bez hub-a rade i dalje); `AnnouncementsModule` (API) importuje `TicketsModule` koji eksportuje hub, a `AnnouncementWorkerModule` importuje `TicketRealtimeBridgeModule` pa sweep u worker procesu dobija hub s Redis forwarderom.
- **Frontend.** `AnnouncementsHost` se pretplaćuje na `announcement.changed` preko `acquireHelpdeskSocket`/`subscribeSocketEvent` i invalidira `["announcements", "active"]`; refetch ide vlastitom autorizacijom (`GET /announcements/active`), pa signal nikad ne nosi sadržaj van publike. Modal logika: kandidat se bira za svaku **novu** MODAL najavu pristiglu nakon inicijalnog mounta (realtime ili poll), svaki `id` se odlučuje najviše jednom po mountu, session budžet (`modalShowsLeft`) i dalje važi — riješen/potvrđen/zatvoren dijalog se ne otvara ponovo. Poll od 60 s ostaje fallback za propušten signal.

## Testovi i granice

Backend: novi `announcements.realtime.spec.ts` (publish po primaocu; bez publisha na dedupe pogodak) i `ticket-realtime-announcement.spec.ts` (hub subscribe/unsubscribe, best-effort izolacija listenera, awaited propagacija greške za retry, bridge parser accept/reject). Frontend: `announcements-host.spec.tsx` — signal invalidira aktivni upit; MODAL najava pristigla nakon inicijalnog rendera otvara dijalog. Lokalno: backend announcements + realtime/websocket suiteovi, ciljani ESLint; frontend announcements testovi (12) + `tsc --noEmit` + Prettier. Lokalni Jest stub nije generated-Prisma dokaz; CI na pushu je autoritet.

## Operativna potvrda (R1–R3)

Preduslov: redeploy svježeg builda (API + worker + frontend) i dva korisnika — admin/manager koji objavljuje i običan korisnik iz publike koji je **već prijavljen i ne osvježava stranicu**.

| ID | Koraci | Očekivano |
| --- | --- | --- |
| R1 | Korisnik-publika neka ostane prijavljen na početnoj stranici bez osvježavanja. Admin u editoru najava objavi najavu s prikazom **Traka (BANNER)**, publikom koja uključuje tog korisnika i početkom odmah (ili zakazano za ~1 minutu). | Traka s najavom sama se pojavi kod prijavljenog korisnika u roku od nekoliko sekundi, bez osvježavanja stranice. |
| R2 | Isto, ali prikaz **Dijalog (MODAL)**. | Dijalog se sam otvori kod prijavljenog korisnika; nakon potvrde/zatvaranja se ne otvara ponovo. |
| R3 | Objavi najavu pa je odmah povuci (Withdraw) dok je korisnik prijavljen. | Traka/dijalog nestaje bez osvježavanja (isti signal + refetch; ako povlačenje ne generiše inbox zapis, nestanak se vidi najkasnije na pollu od 60 s — izvijestiti koje se desilo). |

Odgovor: `R1: DA/NE, R2: DA/NE, R3: DA/NE` + opis odstupanja ako ih ima. CI `43040740316` (success) dao je generated-Prisma/PostgreSQL dokaz, a vlasnik je operativno potvrdio R1/R2/R3 = DA (R3 nestanak nakon ~1 min preko poll fallbacka) — nalaz je zatvoren, vidi audit 28 §29.
