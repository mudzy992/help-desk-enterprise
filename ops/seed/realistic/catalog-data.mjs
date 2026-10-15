const option = (value, label) => ({ value, label });

const field = (id, label, type, extra = {}) => ({
  id,
  label,
  type,
  required: extra.required === true,
  order: extra.order ?? 0,
  validation: extra.validation ?? {},
});

export const catalog = [
  {
    category: { slug: 'opste', name: 'Opšte' },
    slug: 'opsti-zahtjev',
    name: 'Opšti zahtjev',
    sla: 'STANDARD_REQUEST',
    group: 'fallback',
    fields: [field('opis', 'Šta vam treba', 'textarea', { required: true, validation: { maxLength: 4000 } })],
  },
  {
    category: { slug: 'radno-mjesto', name: 'Radno mjesto' },
    slug: 'incident-radna-stanica',
    name: 'Incident — radna stanica',
    sla: 'INCIDENT',
    group: 'ra-unarska-oprema',
    fields: [
      field('uredjaj', 'Uređaj', 'select', {
        required: true,
        validation: { options: [option('laptop', 'Laptop'), option('desktop', 'Stoni računar'), option('monitor', 'Monitor')] },
      }),
      field('simptom', 'Šta se dešava', 'textarea', { required: true, order: 1, validation: { maxLength: 4000 } }),
    ],
  },
  {
    category: { slug: 'radno-mjesto', name: 'Radno mjesto' },
    slug: 'stampa',
    name: 'Štampač ne radi',
    sla: 'INCIDENT',
    group: 'ra-unarska-oprema',
    fields: [
      field('lokacija', 'Gdje je štampač', 'text', { required: true, validation: { maxLength: 120 } }),
      field('simptom', 'Simptom', 'select', {
        order: 1,
        required: true,
        validation: {
          options: [option('zaglavljeno', 'Zaglavljen papir'), option('toner', 'Nema tonera'), option('offline', 'Ne vidi se na mreži')],
        },
      }),
    ],
  },
  {
    category: { slug: 'radno-mjesto', name: 'Radno mjesto' },
    slug: 'nova-oprema',
    name: 'Zahtjev za opremu',
    sla: 'STANDARD_REQUEST',
    group: 'ra-unarska-oprema',
    approval: true,
    fields: [
      field('vrsta', 'Vrsta opreme', 'select', {
        required: true,
        validation: { options: [option('laptop', 'Laptop'), option('monitor', 'Monitor'), option('telefon', 'Telefon')] },
      }),
      field('obrazlozenje', 'Obrazloženje', 'textarea', { required: true, order: 1, validation: { maxLength: 2000 } }),
    ],
  },
  {
    category: { slug: 'pristup-identitet', name: 'Pristup i identitet' },
    slug: 'reset-lozinke',
    name: 'Reset lozinke ili otključavanje',
    sla: 'ACCESS',
    group: 'it-podr-ka-l1',
    fields: [
      field('nalog', 'Korisničko ime ili e-pošta', 'text', { required: true, validation: { maxLength: 120 } }),
      field('sistem', 'Sistem', 'select', {
        order: 1,
        required: true,
        validation: { options: [option('windows', 'Windows nalog'), option('posta', 'Pošta'), option('vpn', 'VPN')] },
      }),
    ],
  },
  {
    category: { slug: 'pristup-identitet', name: 'Pristup i identitet' },
    slug: 'pristup-folderu',
    name: 'Pristup dijeljenom folderu',
    sla: 'ACCESS',
    group: 'it-podr-ka-l1',
    approval: true,
    fields: [
      field('putanja', 'Putanja foldera', 'text', { required: true, validation: { maxLength: 300 } }),
      field('nivo', 'Nivo pristupa', 'select', {
        order: 1,
        required: true,
        validation: { options: [option('citanje', 'Čitanje'), option('izmjena', 'Čitanje i izmjena')] },
      }),
    ],
  },
  {
    category: { slug: 'pristup-identitet', name: 'Pristup i identitet' },
    slug: 'kadrovski-nalog',
    name: 'Kadrovski IT nalog',
    sla: 'HR',
    group: 'it-podr-ka-l1',
    approval: true,
    fields: [
      field('vrsta', 'Vrsta zahtjeva', 'select', {
        required: true,
        validation: {
          options: [option('novi', 'Novi zaposlenik'), option('odlazak', 'Prestanak radnog odnosa'), option('izmjena', 'Izmjena ovlaštenja')],
        },
      }),
      field('osoba', 'Ime i prezime', 'text', { required: true, order: 1, validation: { maxLength: 120 } }),
    ],
  },
  {
    category: { slug: 'komunikacije', name: 'Komunikacije' },
    slug: 'vpn-pristup',
    name: 'VPN i udaljeni pristup',
    sla: 'INCIDENT',
    group: 'it-podr-ka-l1',
    fields: [
      field('lokacija', 'Odakle se spajate', 'text', { required: true, validation: { maxLength: 120 } }),
      field('greska', 'Poruka greške', 'textarea', { order: 1, validation: { maxLength: 2000 } }),
    ],
  },
  {
    category: { slug: 'komunikacije', name: 'Komunikacije' },
    slug: 'posta',
    name: 'Outlook i pošta',
    sla: 'INCIDENT',
    group: 'it-podr-ka-l1',
    fields: [
      field('simptom', 'Simptom', 'select', {
        required: true,
        validation: {
          options: [option('ne-salje', 'Ne šalje'), option('ne-prima', 'Ne prima'), option('pretraga', 'Pretraga ne radi')],
        },
      }),
    ],
  },
  {
    category: { slug: 'poslovne-aplikacije', name: 'Poslovne aplikacije' },
    slug: 'instalacija-aplikacije',
    name: 'Instalacija aplikacije',
    sla: 'STANDARD_REQUEST',
    group: 'it-podr-ka-l1',
    fields: [
      field('aplikacija', 'Naziv aplikacije', 'text', { required: true, validation: { maxLength: 120 } }),
      field('obrazlozenje', 'Zašto je potrebna', 'textarea', { required: true, order: 1, validation: { maxLength: 2000 } }),
    ],
  },
  {
    category: { slug: 'poslovne-aplikacije', name: 'Poslovne aplikacije' },
    slug: 'poslovni-sistem',
    name: 'Poslovni informacioni sistem',
    sla: 'FINANCE',
    group: 'it-podr-ka-l1',
    fields: [
      field('modul', 'Modul', 'select', {
        required: true,
        validation: {
          options: [option('obracun', 'Obračun'), option('kadrovi', 'Kadrovi'), option('skladiste', 'Skladište')],
        },
      }),
      field('opis', 'Opis problema', 'textarea', { required: true, order: 1, validation: { maxLength: 4000 } }),
    ],
  },
];

