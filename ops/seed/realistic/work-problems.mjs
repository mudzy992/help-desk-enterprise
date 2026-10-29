import { insert, seedId } from './context.mjs';

export async function seedProblems(client, context, services) {
  await insert(client, 'ProblemSequence', { id: 1, lastNumber: 2 });
  await insert(client, 'Problem', {
    id: seedId('pr_mail'),
    sequence: 1,
    title: 'Outlook pretraga na terminalskom serveru',
    description: 'Indeks pretrage se ne gradi. Korisnici ne vide starije poruke u Outlooku.',
    status: 'KNOWN_ERROR',
    priority: 'MEDIUM',
    organizationalUnitId: context.itUnitId,
    serviceId: services.get('posta').id,
    groupId: context.group('radne-stanice-problem').id,
    ownerUserId: context.agents.problems.id,
    workaround: 'Pretraga preko web pošte dok se indeks ne obnovi.',
    knowledgeArticleId: seedId('kb_outlook-pretraga'),
  });
  await insert(client, 'ProblemTicket', {
    problemId: seedId('pr_mail'),
    ticketId: seedId('t_mail'),
  });
  await insert(client, 'Problem', {
    id: seedId('pr_vpn'),
    sequence: 2,
    title: 'Prekidi VPN-a iz poslovnice Visoko',
    description: 'Sesije iz Visokog padaju oko jedne minute. Ostale poslovnice nisu pogođene.',
    status: 'INVESTIGATING',
    priority: 'HIGH',
    organizationalUnitId: context.itUnitId,
    serviceId: services.get('vpn-pristup').id,
    groupId: context.group('radne-stanice-problem').id,
    ownerUserId: context.agents.problems.id,
  });
  await insert(client, 'ProblemTicket', {
    problemId: seedId('pr_vpn'),
    ticketId: seedId('t_vpn'),
  });
}
