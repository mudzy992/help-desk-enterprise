# BA-on-call-06: owner rasporeda mora pripadati grupi

Status: **zatvoreno** (operativna potvrda korisnika: owner lista nudi samo članove grupe). Automatski CI `42831878115` za commit `30c51e0` prošao je uspješno (generated Prisma + stvarni PostgreSQL). Schedule owner prima gap obavještenja za grupu (koja smjena je nepokrivena i kada), a save je ownera validirao samo kao bilo kojeg aktivnog staff korisnika — strani staff bez ikakve veze s grupom mogao je postati owner i primati te informacije, uključujući i nakon što napusti organizaciju.

## Izmjena

- Save: eksplicitni owner mora biti eligibilan član te grupe (`listEligibleMembers`: aktuelan `GroupMember`, aktivan, staff rola) ili sam manager koji sprema raspored; svi ostali se odbijaju s `ON_CALL_INVALID_MEMBER` (`owner`). Podrazumijevani owner (manager koji sprema) se ne mijenja.
- Čitanje/sweep: data loader sada za svaki schedule izračunava i validne ownere — owner zadržava pravo na gap obavještenja samo ako je i dalje aktivan staff **i** (aktuelan član grupe ili globalni manager s ADMIN/SUPER_ADMIN rolom); u suprotnom kontekst nosi `ownerUserId: null` i sweep ne šalje gap obavještenje. Ovo pokriva i historijske redove sa stranim ownerom i naknadno uklanjanje iz grupe/deaktivaciju, bez potrebe za ponovnim spremanjem rasporeda.

## Granice

Scoped (OU) manager koji nije član grupe može biti owner samo ako sam sprema raspored; dodjela takvog managera kao ownera od strane drugog managera traži da osoba bude član grupe. Detaljni prikaz i dalje pokazuje zapisanog ownera — mijenja se samo pravo na gap obavještenja i save validacija. Automatski CI `42831878115` za `30c51e0` prošao je uspješno; bez operativne potvrde nalaz se ne zatvara. Migracija nije rađena.
