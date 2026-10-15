import { insert, seedId } from './context.mjs';

export async function seedKnowledge(client, context, services) {
  const categories = [
    ['pristup', 'Pristup', 'Access', 'key-round'],
    ['radno-mjesto', 'Radno mjesto', 'Workplace', 'laptop'],
    ['posta', 'Pošta', 'Mail', 'mail'],
  ];
  for (const [key, nameBs, nameEn, icon] of categories) {
    await insert(client, 'KnowledgeCategory', {
      id: seedId(`kbcat_${key}`),
      key,
      nameBs,
      nameEn,
      icon,
      sortOrder: categories.findIndex((item) => item[0] === key),
    });
  }
  const articles = [
    {
      slug: 'reset-lozinke-windows',
      title: 'Reset Windows lozinke',
      category: 'pristup',
      service: 'reset-lozinke',
      body: 'Ako je nalog zaključan, sačekajte 15 minuta ili pozovite service desk. Lozinku mijenjate na portalu za samoobsluhu, pa se odjavite i prijavite ponovo. Ne šaljite lozinku e-poštom.',
    },
    {
      slug: 'vpn-prva-provjera',
      title: 'VPN: prva provjera prije prijave kvara',
      category: 'pristup',
      service: 'vpn-pristup',
      body: 'Provjerite da li ste na internetu, da li je klijent zadnje verzije i da li unosite korisničko ime koje traži organizacija. Ako poruka kaže da je lozinka istekla, prvo otvorite zahtjev za reset. Ako veza puca poslije minute samo iz jedne poslovnice, to je poznat problem na lokalnoj liniji.',
    },
    {
      slug: 'outlook-pretraga',
      title: 'Outlook pretraga ne vraća poruke',
      category: 'posta',
      service: 'posta',
      body: 'Na terminalskom serveru indeks pretrage se ne gradi lokalno. Koristite pretragu na webu pošte dok se indeks ne popravi. Ne brišite OST datoteku bez dogovora sa service deskom.',
    },
    {
      slug: 'stampac-zaglavljen',
      title: 'Zaglavljen papir u štampaču',
      category: 'radno-mjesto',
      service: 'stampa',
      body: 'Otvorite prednja i zadnja vrata, izvucite papir u smjeru kretanja i zatvorite sve ladice. Ako štampač i dalje javlja zaglavljenje, ne vadite toner. Prijavite lokaciju i inventarni broj.',
    },
  ];
  const itUnit = context.itUnitId;
  for (const article of articles) {
    await insert(client, 'KnowledgeArticle', {
      id: seedId(`kb_${article.slug}`),
      slug: article.slug,
      title: article.title,
      body: article.body,
      status: 'PUBLISHED',
      classification: 'INTERNAL',
      serviceId: services.get(article.service).id,
      organizationalUnitId: itUnit,
      categoryId: seedId(`kbcat_${article.category}`),
      publishedAt: new Date(),
      isFaq: true,
    });
  }
  const templates = [
    ['prijem', 'Potvrda prijema', 'Primili smo vaš zahtjev i javljamo se čim bude red na vas.'],
    ['dodatno', 'Tražimo dodatne informacije', 'Da bismo nastavili, molimo pošaljite tačnu poruku greške i vrijeme kada se problem javio.'],
    ['rijeseno', 'Molimo potvrdu rješenja', 'Primijenili smo ispravku. Javite da li sada radi kako treba, pa zatvaramo zahtjev.'],
  ];
  for (const [key, name, body] of templates) {
    await insert(client, 'ResponseTemplate', {
      id: seedId(`tpl_${key}`),
      name,
      bodyBs: body,
      kind: 'REPLY',
      isActive: true,
    });
  }
  await insert(client, 'Playbook', {
    id: seedId('pb_vpn'),
    name: 'VPN ne radi',
    description: 'Provjera prije eskalacije mrežnom timu.',
    isActive: true,
    version: 1,
  });
  const steps = [
    ['klijent', 'Provjeri verziju VPN klijenta', 'Korisnik mora imati odobrenu verziju.', true],
    ['lozinka', 'Isključi isteklu lozinku', 'Ako je nalog zaključan, prebaci na reset lozinke.', true],
    ['linija', 'Uporedi sa poznatim prekidom', 'Ako je lokacija Visoko, veži tiket za otvoreni incident.', false],
  ];
  for (const [index, step] of steps.entries()) {
    await insert(client, 'PlaybookStep', {
      id: seedId(`pb_vpn_${step[0]}`),
      playbookId: seedId('pb_vpn'),
      stepKey: step[0],
      position: index,
      title: step[1],
      instructions: step[2],
      required: step[3],
      knowledgeArticleId: index === 0 ? seedId('kb_vpn-prva-provjera') : null,
    });
  }
  await insert(client, 'PlaybookService', {
    playbookId: seedId('pb_vpn'),
    serviceId: services.get('vpn-pristup').id,
  });
  await insert(client, 'Playbook', {
    id: seedId('pb_lozinka'),
    name: 'Otključavanje naloga',
    description: 'Identitet se potvrđuje prije reseta.',
    isActive: true,
    version: 1,
  });
  await insert(client, 'PlaybookStep', {
    id: seedId('pb_lozinka_identitet'),
    playbookId: seedId('pb_lozinka'),
    stepKey: 'identitet',
    position: 0,
    title: 'Potvrdi identitet pozivom na službeni broj',
    required: true,
    knowledgeArticleId: seedId('kb_reset-lozinke-windows'),
    responseTemplateId: seedId('tpl_dodatno'),
  });
  await insert(client, 'PlaybookService', {
    playbookId: seedId('pb_lozinka'),
    serviceId: services.get('reset-lozinke').id,
  });
}
