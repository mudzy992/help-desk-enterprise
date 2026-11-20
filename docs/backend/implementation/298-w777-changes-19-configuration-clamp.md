# W7.77 — `BA-changes-19`: modul sam clampuje svoju konfiguraciju

**Paket:** Val 7, `changes`, **P3**<br>
**Nalaz:** „Servis ne clampuje quorum/lead/reminder configuration integer granice”<br>
**Kod:** `backend/src/modules/changes/{change-configuration-bounds.ts (novo), change-access.service.ts, change-cab.ts}` + `backend/src/modules/ops-health/ops-signal-collector.ts`<br>
**DB migracija:** nema (nijedno polje, nijedna postavka se ne mijenja — samo čitanje)

## Nalaz

Sloj postavki **validira standardni UI put**: `change-settings.ts` odbija quorum van `1..20`, lead time van
`0..720` i reminder van `0..168`. Servis je, međutim, prihvatio **svaki cijeli broj**:

```ts
const integer = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isInteger(value) ? value : fallback;
```

Vrijednost može doći mimo tog puta — direktna izmjena u bazi, restore starijeg dumpa, bootstrap skripta ili red
koji je upisala ranija verzija. Posljedice su bile stvarne, ne teorijske:

1. **`minLeadTimeHours` = 99.999** ⇒ `assertChangeWindow` traži 11 godina između slanja na CAB i početka: svaka
   NORMAL promjena pada na `CHANGE_LEAD_TIME`, a administrator na ekranu postavki vidi „0..720”. Negativna
   vrijednost je, obrnuto, **isključivala** provjeru koju je administrator mislio da je uključio.
2. **`reminderHoursBeforeStart`** je imao **dvije istine**: sweep je koristio sirovu vrijednost iz konfiguracije, a
   ops-health kartica ju je klampovala na `0..168` po svome (`Math.min(168, Math.max(0, value))`). Kartica je
   dakle opisivala drugi prozor od onog po kojem sweep šalje podsjetnike.
3. **`reminderHoursBeforeStart` = `NaN`/`Infinity`** (moguće kroz JSON u bazi) pravio je `new Date(now + hours*…)`
   sa nevažećim rasponom u sweep upitu.
4. **`normalQuorum` = `NaN`** ⇒ `computeChangeQuorum` vraća `NaN` ⇒ `evaluateChangeVotes` (`quorum > 0` je
   `false`) nikad ne odobri rundu: promjena ostaje u `AUTHORIZATION` zauvijek, bez ikakvog signala.

## Rješenje

**1. Jedan izvor granica** — `change-configuration-bounds.ts`:

```ts
changeConfigurationBounds = {
  normalQuorum: { min: 1, max: 20 },
  emergencyQuorum: { min: 1, max: 20 },
  minLeadTimeHours: { min: 0, max: 720 },
  reminderHoursBeforeStart: { min: 0, max: 168 },
};
clampChangeInteger(value, bounds, fallback); // ne-cijeli broj → fallback (i sam klampovan)
```

Vrijednosti su **identične** onima u `change-settings.ts`; test tvrdi tu jednakost, pa dvije strane ne mogu tiho
odstupiti jedna od druge.

**2. Servis klampuje pri čitanju, i to imenuje.** `ChangeAccessService.configuration()` sada prolazi kroz
`settingInteger(key, value, bounds, fallback)`: vrijednost se klampuje, a svako odstupanje se loguje kao
`change_setting_clamped key=… stored=… applied=…` na `warn`. Klampovanje (a ne odbijanje) je namjerno: modul
ostaje upotrebljiv, a operator u logu vidi zašto se ponašanje razlikuje od onoga što piše na ekranu postavki.

**3. Odluka o kvormuu se ne pravi iz nevalidnog broja.** `computeChangeQuorum` klampuje i samo podešavanje, a
nevalidan broj zamjenjuje **dokumentovanim defaultom** (`2` za NORMAL, `1` za EMERGENCY) — ranije je `NaN`
prolazio do `evaluateChangeVotes` i zaključavao rundu. Gornja granica je `20` (ono što postavke dozvoljavaju), a
donja i dalje `1`, pa nula ne može sama sebe odobriti; broj glasača i dalje ograničava kvorum odozgo.

**4. Jedna istina za podsjetnike.** `ops-signal-collector` više ne računa svoj `Math.min(168, Math.max(0, …))`
nego koristi isti `clampChangeInteger` i iste granice — kartica i sweep sada gledaju isti prozor, uključujući
`NaN`/`Infinity` (default) i vrijednost van raspona (granica).

## Promjena ponašanja (namjerna, vidljiva)

- quorum **ne može preći 20**, čak i ako CAB ima 150 članova: `20` je maksimum koji postavke dozvoljavaju, a
  vrijednost iznad njega može doći samo mimo validacije. W7.70 test je ažuriran (roster od 150 glasača se i dalje
  zamrzava **u cjelini** — to je ono što je W7.70 popravio — ali kvorum je `20`, ne `150`).
- lead time **ne može preći 720 h** (30 dana) i ne može biti negativan; reminder **ne može preći 168 h**, i
  `NaN`/`Infinity` više ne stižu do sweep upita.
- ništa se ne odbija: promjena je klampovanje + `warn` log, bez nove greške i bez novog kod-a u API-ju.

## Dokazi

- `change-configuration-bounds.spec.ts` — **5** (granice = postavke, unutar raspona, klamp gore/dolje,
  ne-cijeli broj → default, default koji izlazi iz granica se takođe klampuje, saglasnost sa `changeDefaults`);
- `change-quorum-bounds.spec.ts` — **6** (STANDARD = 0, kvorum ≤ glasača, klamp 1..20, nula → 1, `NaN`/`3.7` →
  default, bez glasača → 1);
- `change-access.service.spec.ts` — **+2** (klampovana četiri pohranjena broja + 4 `warn` zapisa; ne-broj →
  dokumentovani default);
- `change-approvals-snapshot.spec.ts` — W7.70 test ažuriran na klampovanu granicu (`150` → `20`) uz
  nepromijenjenu tvrdnju da se cijeli roster od 150 glasača zamrzava;
- `modules/changes` + `modules/ops-health` — **55 suite / 422 testa** zeleno; `eslint` čist.

## Šta nije u ovom paketu

- **Sloj postavki nije mijenjan** — on je već tačan; paket dodaje odbranu na mjestu gdje se vrijednost koristi.
- **Lista zamrzavanja** (`freezePeriods`) već ima granicu: `parseFreezePeriods` odbija više od 50 zapisa i
  nevažeće datume, pa nema šta da se klampuje.
- **`numberPrefix`** je string i van nalaza; klampovanje dužine bi bilo kozmetička promjena bez nalaza iza sebe.
- `BA-changes-20` (compile-blocked suite + service/concurrency/failure E2E matrica) ostaje otvoren.

## Rizik i rollback

- **Rizik:** instalacija koja je „u praksi” radila sa quorumom > 20 (ručno upisanim) sada dobija kvorum 20 i
  lakše odobrava. To je i namjera i vidljivo je u logu (`change_setting_clamped`), a ispravna vrijednost se
  postavlja kroz ekran postavki.
- **Rizik:** lead time iznad 720 h se tiho svodi na 720 h. Ponovo: log + dokumentovana granica; ko treba duži
  lead time, to je zahtjev za izmjenu granica, ne za ručni upis u bazu.
- **Rollback:** vraćanje `change-access.service.ts`, `change-cab.ts` i `ops-signal-collector.ts` na prethodnu
  verziju; `change-configuration-bounds.ts` tada ostaje nekorišten. Nema podataka za migraciju ni natrag.
