# Backend Val 2 — W2.2 durable session revocation i authz authority

## 1. Status i dokaz

- Status paketa: **završen**.
- Implementacijski commit: `10e8fd6ea1c328d647b6f2bc77960567f8bc8af5`.
- Kanonski CI dokaz: run **40119814862**, potpuno zelen.
- Prošli su backend build/lint/puni Jest, safety-net i wiring suiteovi, stvarni PostgreSQL/Redis integration runner, container/supply-chain, frontend, docs i završni CI gate.

## 2. Sigurnosna odluka

Redis više nije autoritet za principal ili modernu registry sesiju. Redis ostaje cache/ubrzanje, dok je PostgreSQL durable authority:

- svaki cached principal hit provjerava mali PostgreSQL authority projection (`authzVersion`, `isActive`, `mustChangePassword`);
- version mismatch, deaktivacija ili obavezna promjena lozinke odbacuju cached payload i učitavaju aktuelni principal;
- greška authority čitanja ne može potvrditi cached grant;
- svaki JWT sa `sid` provjerava aktivan, neistekao `UserSession` red koji pripada token subjectu;
- PostgreSQL session-authority greška je fail-closed;
- Redis revocation read greška je fail-closed.

Time se prekida stale-privilege prozor između replika čak i kada Redis tombstone/invalidation write nije uspio.

## 3. Multi-replica i failure dokaz

Novi real-PostgreSQL suiteovi dokazuju:

1. replika A napuni zajednički principal cache;
2. deactivation se commitira direktno u PostgreSQL bez Redis invalidacije;
3. replika B ne prihvata stale active principal;
4. aktivna registry sesija prolazi uz stale Redis koji nema revocation zapis;
5. revocation commit replike A je na narednoj provjeri vidljiv replici B;
6. session ID drugog subjecta je odbijen.

Unit/fault testovi dodatno dokazuju fail-closed ponašanje kada PostgreSQL session authority ili Redis revocation check nisu dostupni.

## 4. Operativni trade-off

Cache hit sada ima mali indexed PostgreSQL authority read. To je namjeran security-over-latency izbor: cache čuva široki principal payload i joinove, ali nije samostalan izvor prava. Deployment-wide connection budget ostaje pokriven postojećim CI guardom; buduća optimizacija smije ukloniti authority read samo ako uvede jednako durable, monotono i dokazano revocation rješenje.

## 5. Findings odluka

- `BA-xcut-05` je zatvoren: cached principal se više ne može prihvatiti bez durable authority fencea, uključujući Redis failure/omission scenarij.
- `BA-authentication-02` ostaje otvoren: moderni `sid` tok i Redis outage enforcement su popravljeni, ali legacy JWT bez `sid` još nema durable per-user cutoff nakon neuspjelog Redis writea.
- `BA-authentication-01` ostaje otvoren i pripada sljedećem authentication paketu: refresh mora eksplicitno odbiti nestao/istekao/revoked registry red.

## 6. Sljedeći paket

**W2.3 — centralni permission + OU/service/ownership policy:** uvesti jednu fail-closed policy odluku, ukloniti role-key shortcut pristupe i dokazati cross-user, cross-OU i service-scope negativnu matricu na stvarnom PostgreSQL-u.
