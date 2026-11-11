# BA-inbound-email-09: ograničeni metadata retention batch

Status: **zatvoreno** (operativna potvrda korisnika: retention bez grešaka u logu workera).  Metadata retention je bio jedan neograničen `deleteMany` nad svim redovima starijim od cutoffa; ovaj paket ga zamjenjuje jednim stabilno sortiranim batchom po noćnom pokretanju, po istom obrascu kao BA-integration-queue-09. Automatski CI `42791008690` za commit `23ccbe2` prošao je uspješno (generated Prisma + stvarni PostgreSQL); Perf smoke za ovaj push nije pokrenut (path filter).

## Mehanizam

- `applyRetention` za metadata redove sada prvo bira najviše `inboundEmailLimits.retentionBatch` (500) najstarijih kandidata (`createdAt` asc, `id` asc, samo `id`), pa briše isključivo te ID-jeve uz ponovnu provjeru `createdAt < cutoff` unutar istog `deleteMany`.
- Pun batch loguje `inbound_email_retention_batch_limit_reached possible_backlog=true`, pa zaostatak nije tiho prikriven neograničenim brisanjem.
- Raw-original faza nije mijenjana: već je radila u batchovima od 500 i uklanjala `rawStorageKey` po batchu; njen ukupan broj batchova po pokretanju i dalje nije ograničen (vidi ograničenja).

## Ograničenja

Po pokretanju se briše najviše 500 metadata redova, pa veliki historijski zaostatak nestaje kroz više noćnih pokretanja — to je namjerna cijena ograničenog opterećenja baze. Nema zasebnog indeksa dokaza ni mjerenja trajanja/WAL opterećenja retentiona. Raw faza i dalje može obraditi neograničen broj batchova u jednom pokretanju; ovaj paket cilja samo nalaz o metadata `deleteMany`. Automatski CI `42791008690` za `23ccbe2` prošao je uspješno; bez operativne potvrde nalaz se ne zatvara. Nije pokrenuta migracija ni deployment.
