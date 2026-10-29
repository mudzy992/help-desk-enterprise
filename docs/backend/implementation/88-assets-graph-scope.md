# W7.2 — Scope-filter relation i contract prikaza imovine

**Val:** 7 / W7 — domain workflows (`assets`, `problems`, `changes`, `knowledge-base`, `reports`, `search`)<br>
**Paket:** W7.2 — redakcija foreign asset čvorova iz relation/contract prikaza<br>
**Nalaz:** `BA-assets-02` (P1) — zatvoren<br>
**Implementacijski commit:** `972e5fffbd00aa5ac398bf62e2900cc1faba7c18`<br>
**Format commit:** `b73a7611ae6b25fa2ff052e2d17df1992e4afef5`<br>
**Finalni testani SHA:** `b73a7611ae6b25fa2ff052e2d17df1992e4afef5`<br>
**CI:** [40917663219](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40917663219) — zelen<br>
**DB migracije:** nema

## Nalaz i acceptance

`BA-assets-02` je utvrdio da detail asseta vraća identitet foreign relation endpointa, a contract detail vraća ID/tag/name/status foreign itema uz `canOpen=false`. Nedostupnost linka nije redakcija: klijent je već dobio osjetljive identifikatore i polja.

Acceptance za W7.2 je da se svaki asset graf čvor filtrira po istom `asset.read` OU subtree scopeu prije response shapeanja. Dozvoljeno je prikazati samo agregatni broj skrivenih veza/stavki, po uzoru na postojeći impact hidden-count ugovor. Instalacijski/globalni čitalac zadržava potpuni prikaz.

## Implementacija

- `AssetsService.detail()` prosljeđuje read scope u `relationsOf()`. Izlazne i ulazne relation pretrage filtriraju drugi endpoint preko `organizationalUnit.ouPath` i `unitScopeWhere(scope)`; ID, inventarni broj, naziv, status, tip i relation ID foreign čvora se ne uključuju u odgovor.
- Scoped relation odgovor sadrži samo vidljive relacije i `relationHiddenCount`. Hidden count računa se odvojeno od vidljivih upita, za oba smjera; globalni scope dobija `0` bez dodatnih count upita.
- `AssetContractsService.detail()` filtrira `AssetContractItem` po OU scopeu prije učitavanja polja asseta. `items` sadrži samo vidljive assete; `itemCount` predstavlja broj vidljivih stavki, a `hiddenItemsCount` agregatni broj foreign stavki. `canOpen` ostaje `true` za sve vraćene čvorove.
- Relations panel i contract detail prikazuju postojeću lokalizovanu `assets.impact.hidden` poruku. Prazno stanje se ne prikazuje kada postoje samo foreign, redigovane veze.
- Real-PostgreSQL suite je registrovan u izolovanom integration runneru i njegovom harness contract testu.

Nije mijenjan scope za `removeRelation`, licencne assignment-e, requester asset view niti druge susjedne putanje; njihovi nalazi ostaju otvoreni i nisu dio ovog closeouta.

## Direktni acceptance testovi

Novi `backend/src/modules/assets/asset-scope-display.integration.spec.ts` sadrži dva testa koji pozivaju stvarne `AssetsService.detail()` i `AssetContractsService.detail()` nad zasebnom PostgreSQL bazom:

1. **Relacije u oba smjera:** root/child relacije unutar OU subtreea ostaju vidljive; foreign outgoing i incoming endpointi se izostavljaju, a `relationHiddenCount` iznosi `2`. Test eksplicitno potvrđuje da response nema foreign asset ID, tag, name, status, type (BS/EN) niti relation edge ID. Globalni viewer dobija sve četiri relacije i hidden count `0`.
2. **Contract items:** ugovor sa root, child i foreign assetom vraća samo dva vidljiva itema, `itemCount=2` i `hiddenItemsCount=1`. Foreign ID, tag, name, type oznake i status nisu u JSON odgovoru. Globalni viewer dobija sva tri itema, `itemCount=3` i hidden count `0`.

## CI i testni dokaz

Finalni CI run [`40917663219`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40917663219), na SHA `b73a7611ae6b25fa2ff052e2d17df1992e4afef5`, je zelen:

- **Backend build + test:** Prisma schema/client, backend build, ESLint, ranije compile-blocked suites, wiring/SLA provjere i kompletan backend test run — prošli.
- **Backend PostgreSQL + Redis integration:** migracije, privilegije, rollback/cleanup, integration harness i sve real-PostgreSQL integration suite — prošli; nova asset scope-display suite je uključena u ovaj korak.
- **Frontend build + test:** lint, Prettier, testovi, build i bundle/cold-route budžeti — prošli.
- **Docs guard** i **CI gate** — prošli.
- **Backend container + supply chain** job — prošao; pojedinačni korak enforcementa za nula high/critical image ranjivosti bio je `skipped`, ne `failed`.
- Push workflow je preskočio E2E critical flows i install-wizard jobove.

Transparentnost: prvi run [`40916554238`](https://github.com/mudzy992/help-desk-enterprise/actions/runs/40916554238), na implementacijskom SHA `972e5fffbd00aa5ac398bf62e2900cc1faba7c18`, pao je isključivo na frontend Prettier provjeri za relation panel. Backend build/test i PostgreSQL+Redis integration tada su prošli. Format je ispravljen u `b73a761`; finalni run `40917663219` je zelen.

Dodatne lokalne provjere: ciljani Prettier check i `git diff --check` su prošli. Lokalni backend Jest nije pokretan u sandboxu jer backend dependencyji nisu instalirani; real testni dokaz je izvršeni CI.

## Migracija, rollout i zatvaranje

Nema schema promjene, Prisma migracije ni manual apply koraka. Iskorišteni su postojeći OU path i relation/contract link modeli. Rollout ne zahtijeva DB pripremu; rollback je code revert. U trenutku W7.2 closeouta zatvoren je samo `BA-assets-02`; `BA-assets-03/04`, license scope i relation mutation granice ostali su otvoreni.

**Naredni korak nakon ovog paketa:** W7.3 — `BA-assets-03` je naknadno zatvoren uz zeleni finalni CI `40930141682`; detalji su u [89-assets-version-cas.md](89-assets-version-cas.md). Sljedeći paket je W7.4 — `BA-assets-04` (P1), reminder delivery/state semantika. W7.2 je napredovao tek nakon zelenog CI gatea `40917663219`.
