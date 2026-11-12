# BA-announcements-16: preview publike validira reference i za globalnog menadžera

Status: **otvoreno** (implementirano; čeka CI i operativnu potvrdu vlasnika W1). `previewAudience` je nepoznate OU/group ID-eve tiho odbacivao pri ekspanziji publike, pa je i globalni menadžer za pogrešan ID dobivao uvjerljiv (često nula) broj korisnika umjesto grešku — broj na osnovu kojeg se odlučuje o objavi bio je zavodljiv.

## Izmjena

Bez migracije. `previewAudience` sada, uz postojeću scope provjeru, validira postojanje svake navedene organizacione jedinice i grupe (kao create-time validacija referenci iz BA-05): nepoznata referenca vraća `ANNOUNCEMENT_INVALID_AUDIENCE` (400) prije bilo kakvog brojanja. Role ključevi su već enum-validirani na DTO-u. Frontend editor već ima stanje greške previewa (`audienceUnknown`) — umjesto zavaravajućeg broja prikazuje se poruka da se publika ne može izračunati; zasebna frontend izmjena nije potrebna.

## Testovi i granice

Backend: novi `announcements.preview.spec.ts` (3 testa: nepoznata jedinica odbija bez brojanja; nepoznata grupa odbija; poznata publika broji). Lokalno: backend announcements suite (osim preegzistirajućeg stub-limited delivery test) + ESLint. CI na pushu je autoritet.

## Operativna potvrda (W1)

Preduslov: redeploy svježeg builda (API + frontend).

| ID | Koraci | Očekivano |
| --- | --- | --- |
| W1 | Otvori **Najave → Nova najava**, u sekciji publike odaberi uobičajene uloge/jedinice/grupe i pogledaj prikazani broj korisnika; zatim u pregledaču nije moguće unijeti nepostojeći ID kroz UI, pa je dovoljno da broj za normalnu publiku radi kao dosad. | Broj publike se prikazuje kao i prije za valjane odabire; editor radi bez greške. (Nepoznati ID je API-razina zaštite, pokrivena jediničnim testovima — ako nije moguće provjeriti iz UI-ja, odgovori N/A.) |

Odgovor: `W1: DA/NE/N/A` + opis odstupanja ako ikoje. Bez CI dokaza i operativne potvrde nalaz se ne zatvara.
