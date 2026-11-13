# Val 6 — owner-directed closeout preostalih P3 nalaza

**Status:** Val 6 zatvoren odlukom vlasnika uz prihvaćeni preostali rizik; ovo nije tvrdnja da su svi traženi scenariji dokazani niti da je posljednji full CI prošao.

Vlasnik je nakon pregleda razlike između dopunjavanja dokaza i zatvaranja uz preostali rizik izričito odabrao drugu opciju. Preostalih deset nalaza je `zatvoreno (owner-directed)`: notifications-14, websocket-12–14, integration-queue-13–15 i inbound-email-11–13. Ovo ne mijenja produkcijski kod, testove, migracije ni historijski rezultat CI-ja. Ranije tražene AA1, AB1–AB3 i AC1–AC2 pojedinačne operativne provjere nisu zasebno potvrđene; odluka vlasnika je prihvatanje rizika, ne dokaz njihovog prolaska.

## Dokaz i njegove granice

- [Run 43430133509](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43430133509) na master `f3da956`: backend build/test, PostgreSQL/Redis integration, frontend, container i docs success. E2E **122 passed, 2 failed, 3 flaky, 1 skipped**; CI gate i run su **failure**. Vlasnik je prijavio mrežni prekid i Gmail limit i prihvatio povezane izuzetke. Test 15 je imao connection timeout, test 18 HTTP 500 čiji specifični uzrok nije nezavisno dokazan; flaky 48 i skipped 38 nisu pass. [Paket 225](225-val6-full-run-evidence.md) čuva detalje.
- Puni run bez filtriranja potvrdio je vlasnik. Pošto sažetak navodi sva 2 failed, 3 flaky i jedini skipped test, 57–59 nisu u tim skupovima i zaključuje se da su prošli; pojedinačni prolazni logovi nisu dostupni. Korisnik je zasebno potvrdio 57 i 58. Test 59 je i ranije zasebno prošao `43384203655`.
- Notification dokaz uključuje PostgreSQL outbox/recovery, dedupe, mark-all i pagination integration te pozitivni browser realtime; šira browser recovery/revocation/race matrica nije dokazana.
- WebSocket unit i Redis integration testovi obuhvataju dijelove revocationa i cross-instance isporuke. Lokalni two-instance Redis outage test pokazao je degraded tokom prekida i novu isporuku nakon oporavka; ne dokazuje replay tokom prekida ili kompletnu browser revocation matricu. Zasebni audit WebSocket audita i lokacija gdje je live osvježavanje potrebno ostaje budući posao.
- Queue test 57 dokazuje korelisan terminalni uspjeh prema testnom ugovoru, ne isporuku `PUBLISHED_BEST_EFFORT` do klijenta. Generated-Prisma i DB/processor integration suiteovi prošli su u CI-ju; nije nezavisno potvrđena sva produkcijska operativna matrica Teams ishoda.
- Mail test 58 provjerava SMTP→obrađeni inbound zapis s kreiranim tiketom→API naslov za konfigurirani stack. Ne dokazuje sve provider crash/concurrency slučajeve ni sanitizaciju receiver headera. Raw retention/redaction testovi imaju CI build/test dokaz; nisu dokaz svih kvarova produkcijskog fajlsistema.
- Vlasnik je ranije potvrdio redeploy odobrene `SKIPPED` migracije; to nije zasebna potvrda svih Teams ishoda. Nema nove migracije, deploymenta, PR-a niti mergea u ovom closeoutu.

**Knjigovodstvo:** Val 6 111/111 zatvoreno, 0 otvorenih; izvorni audit/plan 452 otvorena / 242 zatvorena od 694; globalni registar 462 / 232. Deset prethodnih divergencija između izvora i registra ne mijenja se ovim closeoutom.
