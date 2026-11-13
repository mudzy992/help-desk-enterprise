# Val 6 — evidencija punog E2E runa 43430133509

Run [`43430133509`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43430133509) na `master` SHA `f3da956` ima GitHub zaključak **failure**: backend build/test, frontend, PostgreSQL/Redis integration, container i Docs guard su success; E2E je 122 passed, 2 failed, 3 flaky, 1 skipped. Pali su 15 (connect timeout) i 18 (HTTP 500), flaky 23/24 (connect timeout) i 48 (locator assertion), a 38 final-super-admin race je skipped. CI gate je failure. Korisnik je prijavio dvominutni gubitak mreže i dostignut Gmail dnevni limit, te zatražio da se mrežni/mail izuzeci prihvate; uzrok HTTP 500 nije nezavisno utvrđen, niti se flaky 48 ili skipped 38 time mijenjaju u pass.

Korisnik je potvrdio da je ovo bio puni run bez filtriranja i da su testovi 57 i 58 prošli. Test 59 nije među palim, flaky ili jedinim skipped testom; uz puni izbor to implicira pass. Sažetak navodi samo neuspješne, flaky i skipped testove, a pojedinačni log uspješnih testova nije dostupan u sandboxu. Raniji ciljani run [`43384203655`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/43384203655) već je zasebno potvrdio pass testa 59.

- 57 koreliše posao s testnim tiketom/porukom; prihvaćeni `PUBLISHED_BEST_EFFORT` nije dokaz krajnje isporuke.
- 58 šalje jedinstvenu poruku, zahtijeva `PROCESSED` red s istim Message-ID i kreiranim tiketom te provjerava naslov kroz API. Ovo je dokaz tog toka u konfigurisanom okruženju, ne svih crash/concurrency scenarija.
- 59 provjerava korelisani websocket frame i novi red u otvorenom panelu; ne dokazuje cijelu revocation/recovery matricu.

Ovaj dokument ne zatvara nalaze niti sam po sebi mijenja acceptance kriterije. BA-notifications-14 i BA-websocket-14 i dalje imaju dokumentovane šire E2E/revocation/recovery granice; BA-inbound-email-13 širu crash/concurrency/infrastrukturnu matricu. Odvojeni audit WebSocket audita i mjesta za live osvježavanje nije ovim dokumentom završen. Nije izvođena migracija, deployment ni ručni CI.

**Ispravka evidencije:** prije naknadnog usklađivanja 18 ranije propuštenih Val 6 redova globalni registar je stvarno sadržavao 480 otvorenih / 214 zatvorenih, a ne 462 / 232. Nakon usklađivanja tih redova stanje je 462 / 232; deset starijih divergencija ostaje.
