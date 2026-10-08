
# Šta je novo

## Čemu služi ovaj modul

Kratak spisak izmjena u **dokumentaciji i ponašanju aplikacije** koje korisnik osjeti. Tehnički zapis svih
izmjena (uključujući one koje se tiču samo koda) je u `DOCS_CHANGELOG.md` u repozitoriju.

## Kome je namijenjen

**Svim korisnicima** — da vide šta se promijenilo od zadnjeg čitanja vodiča. Administratorima i operativi
koristi kao podsjetnik na izmjene koje traže akciju (npr. pokretanje alata na starijoj instalaciji).

## Kako doći

- **Dokumentacija → Referenca → Šta je novo.**
- **Izvor:** `DOCS_CHANGELOG.md` (repozitorij), gdje je svaka izmjena zapisana s datumom i razlogom.

## Korak po korak

1. Pogledajte najnoviji datum u tabeli ispod.
2. Ako se izmjena tiče vašeg rada, otvorite link na stranicu modula.
3. Ako se tiče administracije (npr. pokretanje alata), proslijedite je administratoru.

## Polja, validacije i statusi

| Datum | Šta se promijenilo | Za koga | Detalji |
|---|---|---|---|
| 2026-10-08 | **5.3.3 — postavke: uslovi i potvrda pri isključenju.** Sistem sada zna koja postavka zavisi od koje, pa se **uključivanje** postavke bez ispunjenih uslova odbija uz poruku koja navodi šta prvo treba uključiti (npr. SMTP se ne može uključiti bez hosta; dio Edge ekstenzije samo dok je modul uključen). **Isključivanje** roditeljske postavke traži potvrdu i tada se zavisne postavke u istom snimanju vraćaju na podrazumijevanu vrijednost — one koje su po defaultu uključene se isključuju, a tajne (npr. lozinka SMTP-a) se **brišu**, pa ponovno uključivanje znači novi unos. Sve promjene idu s jednim razlogom i jednim zapisom u dnevniku izmjena. [interno] U ovom koraku mijenja se serverska strana (API i pravila); ekran „Postavke i dodaci“ s modalom potvrde i tekstovima dolazi u 5.3.4. | SuperAdmin | [sta-je-novo.md](/docs/sta-je-novo) |
| 2026-10-08 | **5.3.2 — administracija identiteta.** Ekran **Korisnici** sada u listi pokazuje da li je potvrda u dva koraka uključena (samo stanje, bez ikakve tajne) i nosi paket politika **samo kad je zaista aktivan**, uz napomenu da je naslijeđen iz organizacione jedinice. Kod **grupa** se uređivanje i **Članovi** otvaraju u desnom panelu s dva taba, a brisanje traži **jednu** potvrdu u kojoj piše naziv grupe i broj članova. Kod **organizacionih jedinica** poruka o grešci stoji odmah ispod reda koji ju je izazvao; ako jedinica nije u ručnom katalogu ili putanja nije usklađena, nijedan zahtjev ne ide na server — prvo se pokreće očitavanje kataloga. Nazivi svih dozvola sada su prevedeni na bosanski i engleski, a nova dozvola bez prijevoda obara build. | Svi korisnici, SuperAdmin | [korisnici-oj-i-grupe.md](/docs/korisnici-oj-i-grupe), [uloge-i-dozvole.md](/docs/uloge-i-dozvole) |
| 2026-10-08 | **5.3.1 — tiketi: izbor usluge, filter po datumu i Grupni inbox kao tab.** Korak **Usluga** pri prijavi tiketa ima pretragu (bez obzira na kvačice), chipove kategorija s brojem usluga, kompaktnu listu grupisanu po kategorijama i sekciju **Nedavno korišteno**; radi i tastaturom. Lista **Svi tiketi** dobila je filter **Kreiran** (danas, zadnjih 7/30 dana, ovaj mjesec ili raspon od–do po vašoj vremenskoj zoni) koji ostaje u adresi stranice, sačuvanim pogledima i CSV izvozu. **Grupni inbox** je sada tab unutar **Svi tiketi**; zasebna stavka menija je uklonjena, a broj tiketa koji čekaju prikazan je na tabu i uz **Svi tiketi**. Stari linkovi `?view=inbox` i dalje rade. | Svi korisnici, Agent | [tiketi.md](/docs/tiketi), [pocetak-rad.md](/docs/pocetak-rad) |
| 2026-10-08 | **5.3.0 — temelji izgleda: poruke o ishodu, zvono, mobilni prikaz i prijava.** Kratke poruke o ishodu akcije (toast) su redizajnirane: ista poruka se više ne slaže nego dobija oznaku ×N, vidljive su najviše tri (ostale čekaju), greške ostaju ~10 s i nose ID zahtjeva koji se kopira klikom, a odbrojavanje stoji dok je miš ili fokus na poruci. Potvrda preuzimanja tiketa iz Grupnog inboxa sada je ista takva poruka (umjesto trake iznad liste). Panel **zvona** se zatvara klikom van njega ili tipkom Escape. Na telefonu je razmak sadržaja manji, dijalozi s dugim sadržajem se skrolaju unutar ekrana, a meni naloga u zaglavlju ima čitljiv naziv za čitače ekrana. Ekran **prijave** dobio je izbor jezika, dugme za prikaz lozinke i upozorenje kad je uključen Caps Lock. | Svi korisnici | [realtime-i-obavjestenja.md](/docs/realtime-i-obavjestenja), [prijava-i-mfa.md](/docs/prijava-i-mfa) |
| 2026-10-08 | **Završetak 5.2 paketa — E2E login tok, rate-limit dokument i 5.4 dizajn.** Dodat je novi end-to-end test koji provjerava cijeli tok prijave: anoniman pristup sigurnosnom profilu vraća 401, nakon ispravne lozinke ne izdaje se token prije drugog faktora, izdani JWT ispravno nosi identifikator sesije, sesija radi i biva opozvana nakon odjave. Napisan je novi operativni dokument o ograničenjima prijava (`docs/ops/rate-limits.md`) koji objašnjava odvojene account i IP buckete, defaultne pragove i postupak kalibracije na stagingu. Pripremljen je dizajn paketa **5.4 — Sigurnosni hardening** (WebAuthn/passkey, konfigurabilni limiti, politika sesija, HIBP provjera lozinke, sigurnosni dnevnik). | Administrator | [prijava-i-mfa.md](/docs/prijava-i-mfa); `docs/ops/rate-limits.md`; `docs/plans/modules/5.4-sigurnosni-hardening.md` |
| 2026-10-08 | **Posljednji nalozi 5.2 paketa (5.2.4, M13/M14).** Nazivi šablona/playbooka sada su jedinstveni neosjetljivo na veličinu slova i na bazi (nema više trke dva paralelna kreiranja); brojač korištenja šablona (`usageCount`) povećava se tek nakon što je poruka trajno sačuvana, tako da neuspio upis nikad ne kvari statistiku. Dodan je API za masovno kačenje playbooka na više tiketa (`POST /tickets/playbooks/bulk-attach`) — tiketi koji već imaju playbook ili su zatvoreni se preskaču bez prekidanja serije. Obavijest „Znanje za pregled“ više ne nosi `ticketId`, već poseban `articleId`/`articleSlug` i otvara stranicu članka u adminu, a na listi obavijesti ima svoju ikonicu knjige. U interceptu korisničkog obrasca, dugme **„Članak je riješio moj problem“** sada bilježi upravo članak koji je korisnik označio palcem gore (ne nasumično prvog), a palac-dolje poništava zelenu potvrdu. Pregled članka na portalu se broji tek nakon 5 sekundi zadržavanja ili 25% skrola, da se bounce ne bi uračunao. Odgovori svih KB mutacija odmah računaju `isStale`, a arhiviranje kategorije se odbija dok u njoj ima aktivnih članaka. | Agent, Administrator | [sabloni-i-playbooks.md](/docs/sabloni-i-playbooks), [baza-znanja.md](/docs/baza-znanja), [realtime-i-obavjestenja.md](/docs/realtime-i-obavjestenja) |
| 2026-10-07 | **Ispravke lista tiketa i nadzor WebSocket emitova (5.2.3).** Pretraženi inbox pod-tab (grupa ili **Neusmjereni red**) sada se čuva u URL-u (`?inboxTab=`), tako da link ka određenom redu možete podijeliti s kolegom i osvježavanje stranice vas ne vraća na početni tab. Mergeani djeca se ne pojavljuju više u grupnim redovima; brojači i filter **Sakrij spojene** konzistentni su između svih listi. Promjena statusa tiketa odmah ponovo otvara dugme **Ponovo otvori** kada je to dopušteno. Sistem nadzire broj WebSocket emitova po sobi kroz sve instance i pali alarm pri neuobičajeno visokoj stopi — novi runbook odjeljak `websocket-emits-high`. | Agent, Administrator | [tiketi.md](/docs/tiketi); runbook za novi alarm u `ops/runbook/ALERTS.md#websocket-emits-high` |
| 2026-10-07 | **Prijava, MFA i administrativni pristup (5.2.1).** Neuspjele prijave koriste odvojeno account kašnjenje i privremeni IP limit; administrativne liste korisnika prikazuju 100 redova po stranici i ukupan broj, a reset neaktivnog naloga traži da ga prvo aktivirate. Posljednji aktivni lokalni SuperAdmin je zaštićen; RBAC jasno razlikuje OR/AND dozvole, OU-scoped upravljanje grupama i auditovani SuperAdmin bypass. Nakon sigurnosne nadogradnje stari MFA rezervni kodovi se moraju izdati ponovo; TOTP ostaje aktivan. | Korisnik, Administrator | [prijava-i-mfa.md](/docs/prijava-i-mfa), [korisnici-oj-i-grupe.md](/docs/korisnici-oj-i-grupe), [uloge-i-permisije.md](/docs/uloge-i-permisije) |
| 2026-10-06 | **Sigurnije brisanje OJ i audit administracije.** Brisanje iz ručnog kataloga sada navodi tip i broj povezanih zapisa koji ga blokiraju; korisnički nalozi se ne brišu, a uklonjene OJ-scoped uloge prikazuju upozorenje. Mutacije korisnika, OJ i grupa ostavljaju audit trag; reset lozinke AD-praćenog naloga se odbija i evidentira. | Administrator | [korisnici-oj-i-grupe.md](/docs/korisnici-oj-i-grupe), [uloge-i-permisije.md](/docs/uloge-i-permisije) |
| 2026-10-06 | **Katalog forme i tiketi (M6).** Server provjerava vrijednosti forme pri kreiranju i izmjeni, usluga se ne može aktivirati bez aktivne verzije, a postavke uključuju/isključuju formu i određuju da li verzija mora biti vezana. Detalj tiketa prikazuje polja prema šemi tiketa i čuva rezervni prikaz nepoznatih ključeva. | Korisnik, Agent, Administrator | [katalog-usluga-i-forme.md](/docs/katalog-usluga-i-forme), [tiketi.md](/docs/tiketi) |
| 2026-10-06 | **Rutanje, red neusmjerenih tiketa i SLA izvještaj (M7/M8/M10).** Matrica pokrivanja filtrira origin OJ i uslugu, po defaultu prikazuje aktivne usluge, omogućava prikaz nacrta/ukinute i paginira po 50 usluga. Red neusmjerenih uključuje i tikete koji su bez pravila poslani u fallback grupu; oznake i ukupan broj ostaju tačni kroz stranice. SLA usklađenost ima OU opseg sa podređenim jedinicama, razreze po OJ/usluzi/grupi i odvojene brojače otvorenih prekoračenja. | Agent, Administrator | [usmjeravanje-i-prioritet.md](/docs/usmjeravanje-i-prioritet), [tiketi.md](/docs/tiketi), [sla.md](/docs/sla) |
| 2026-10-05 | **Tip zahtjeva i željeni rok na tiketu (Val 5).** Pri kreiranju tiketa, u koraku **Detalji**, mogu se unijeti **tip zahtjeva** (do 80 znakova) i **željeni rok**; oba se vide u panelu **Svojstva** na detalju tiketa. Željeni rok je odvojen od SLA roka i ne pokreće eskalaciju. | Korisnik, Agent | [tiketi.md](/docs/tiketi) |
| 2026-10-05 | **Prekidač matrice prioriteta (Val 5).** Administrator može isključiti matricu **uticaj × hitnost** postavkom `private.ticket.priorityMatrix.enabled` (**Administracija → Postavke**); prioritet se tada računa ugrađenom formulom, a popunjene ćelije ostaju sačuvane. | Administrator | [usmjeravanje-i-prioritet.md](/docs/usmjeravanje-i-prioritet), [sla.md](/docs/sla) |
| 2026-10-05 | **Datum „Ažurirano“ u zaglavlju dokumentacije.** Prikazuje se stvarni datum izdanja stranice („Ažurirano: 4. oktobar 2026.“), umjesto neispravnog oblika „2026 M10 4“ koji je davao preglednik bez bosanskih jezičkih podataka. | Svi | [pocetak-rad.md](/docs/pocetak-rad) |
| 2026-10-05 | **Napomene o dostupnosti u vodičima.** Dvije napomene („važi od …“) prepisane su u korisnički jezik: sada piše od kojeg datuma je mogućnost dostupna, bez tehničkih oznaka verzija. | Svi | [status-incidenti-i-planirani-prekidi.md](/docs/status-incidenti-i-planirani-prekidi), [prosljedjivanje-tiketa.md](/docs/prosljedjivanje-tiketa) |
| 2026-10-05 | **Zajednički limiti umjesto po-procesnih (Val 3).** Ograničenje masovnog broadcasta i testnog slanja e-maila sada se drži u Redisu, pa vrijedi za sve instance i ne resetuje se restartom. | Agent, Administrator | [tiketi.md](/docs/tiketi), [posta.md](/docs/posta) |
| 2026-10-05 | **Obavijesti e-mailom pouzdanije (Val 3).** Zaglavljena isporuka se preuzima ponovo (pločica **Operativno zdravlje** prikazuje broj takvih zapisa), SMTP veza se dijeli umjesto da se otvara po e-mailu, a oznake polja u obavijesti prate jezik pošiljaoca/primaoca. | Svi, Administrator, Operativa | [posta.md](/docs/posta) |
| 2026-10-05 | **Veze u dokumentaciji i provjera ažurnosti.** Reference na stranice u tabelama i vodičima su klikabilne, a CI provjerava da stranica „Šta je novo“ ne zaostaje za `DOCS_CHANGELOG.md`. | Svi | [pocetak-rad.md](/docs/pocetak-rad) |
| 2026-10-05 | **Realtime, šabloni i baza znanja (Val 3).** Članstvo u grupnim sobama i admin rola provjeravaju se ponovo tokom veze, ulazak u sobu tiketa je ograničen na 30 poruka u minuti, ponuda šablona filtrira opseg u upitu, a lista baze znanja i presretanje rade u jednom prolazu. | Agent, Administrator | [realtime-i-obavjestenja.md](/docs/realtime-i-obavjestenja), [sabloni-i-playbooks.md](/docs/sabloni-i-playbooks), [baza-znanja.md](/docs/baza-znanja) |
| 2026-10-04 | **Val 2 — sigurnost i vidljivost (deset nalaza).** Provjera šablona pri slanju, zamjena ličnih podataka i pri upisu članka, redakcija broadcasta, nacrti usluga samo adminima, jedan izvor retencije priloga, obavještenje o odobrenju i kapija za `UNROUTED`, eskalacije s primaocem, satovi od `createdAt` i prvi odgovor nezavisan od SLA-a. | Svi, Administrator | [sabloni-i-playbooks.md](/docs/sabloni-i-playbooks), [odobrenja-i-csat.md](/docs/odobrenja-i-csat), [sla.md](/docs/sla), [tiketi.md](/docs/tiketi), [posta.md](/docs/posta), [baza-znanja.md](/docs/baza-znanja), [katalog-usluga-i-forme.md](/docs/katalog-usluga-i-forme) |
| 2026-10-03 | **Default permisije se upisuju pri instalaciji.** Svježa instalacija više ne daje ADMIN/AGENT naloge bez permisija; za starije instalacije postoji alat koji to dopuni. | Administrator, Operativa | [instalacija.md](/docs/instalacija), [uloge-i-permisije.md](/docs/uloge-i-permisije) |
| 2026-10-03 | **Poravnati vodiči `instalacija.md` i `prijava-i-mfa.md`** na istu strukturu kao ostali (dodate sekcije „Čemu služi“, „Kome je namijenjen“, „Kako doći“, „Polja, validacije i statusi“, „Česta pitanja i greške“, „Povezani moduli“). | Svi | [instalacija.md](/docs/instalacija), [prijava-i-mfa.md](/docs/prijava-i-mfa) |
| 2026-10-03 | **Nova stranica „Dokumentacija“ u aplikaciji** (u izradi): pregled, pretraga i navigacija kroz ove vodiče. | Svi | [pocetak-rad.md](/docs/pocetak-rad), [pregled-modula.md](/docs/pregled-modula) |
| 2026-10-03 | **Završena Faza 2 dokumentacije:** vodiči za 15 modula (M1–M15) i tehničke teze. | Svi | [pregled-modula.md](/docs/pregled-modula) |

**Napomena:** tabela prikazuje samo izmjene koje korisnik osjeti; izmjene koje se tiču isključivo interne
implementacije nisu ovdje (vidi `DOCS_CHANGELOG.md`).

## Česta pitanja i greške

- **„Zašto se ponašanje promijenilo, a nema zapisa?“** — Provjerite datum u tabeli i `DOCS_CHANGELOG.md`;
  ako izmjena nije zapisana, prijavite to kao grešku u dokumentaciji.
- **„Gdje je zapis za starije verzije?“** — U `DOCS_CHANGELOG.md`, po modulima (M1–M15); ovdje su samo
  najnovije izmjene.
- **„Da li se vodiči automatski prevode?“** — Ne; sadržaj je na bosanskom, a nazivi dugmadi i ključevi
  postavki ostaju u izvornom obliku.

## Poznata ograničenja

- **Ova stranica se ne generiše automatski** — redovi se dodaju ručno kad se mijenja i `DOCS_CHANGELOG.md`
  (pravilo: izmjena funkcionalnosti povlači izmjenu dokumentacije u istom commitu). CI (`check-docs-content`)
  provjerava da zadnji datum u tabeli nije stariji od zadnjeg datuma u `DOCS_CHANGELOG.md`; za unose koji su
  samo interni koristi se oznaka `[interno]`.
- **Ne prikazuje izmjene iz `docs/plans/**`** — planovi i dizajn dokumenti nisu korisnička dokumentacija.
- **Nema filtera po datumu ili modulu** u prvoj verziji; koristite pretragu Dokumentacije.

## Povezani moduli

- Pregled svih stranica: `pregled-modula.md`
- Rječnik pojmova: `rjecnik.md`
- Česta pitanja: `cesta-pitanja.md`
