import { insert, seedId } from './context.mjs';

const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000);
const daysAhead = (days) => new Date(Date.now() + days * 86_400_000);

export async function seedTickets(client, context, services) {
  const sequence = await client.query(`SELECT last_value, is_called FROM ticket_number_seq`);
  let number = Number(sequence.rows[0]?.last_value ?? 0);
  if (sequence.rows[0]?.is_called) number += 1;
  const nextNumber = () => {
    const current = number;
    number += 1;
    return `T-${String(current).padStart(6, '0')}`;
  };
  const requester = (index) => context.requesters[index % context.requesters.length];
  const tickets = [
    ['t_laptop', 'incident-radna-stanica', 'Laptop se gasi poslije spajanja na dock', 'IN_PROGRESS', 'HIGH', 0, 6],
    ['t_vpn', 'vpn-pristup', 'VPN iz Visokog puca poslije jedne minute', 'WAITING_FOR_USER', 'HIGH', 1, 20],
    ['t_mail', 'posta', 'Outlook pretraga na terminalu ne vraća poruke', 'ASSIGNED', 'MEDIUM', 2, 30],
    ['t_print', 'stampa', 'Kyocera na spratu 2 javlja zaglavljenje', 'CLOSED', 'LOW', 3, 80],
    ['t_folder', 'pristup-folderu', 'Pristup folderu Obračun za novog kolegu', 'PENDING_APPROVAL', 'MEDIUM', 4, 10],
    ['t_pass', 'reset-lozinke', 'Zaključan Windows nalog poslije godišnjeg', 'RESOLVED', 'MEDIUM', 5, 50],
    ['t_app', 'instalacija-aplikacije', 'Potrebna instalacija AutoCAD-a', 'IN_PROGRESS', 'LOW', 6, 15],
    ['t_gear', 'nova-oprema', 'Zamjena monitora koji treperi', 'PENDING_APPROVAL', 'MEDIUM', 7, 8],
    ['t_erp', 'poslovni-sistem', 'Obračun se ne otvara poslije 16 h', 'ASSIGNED', 'HIGH', 8, 12],
    ['t_hr', 'kadrovski-nalog', 'Novi zaposlenik u ED Sarajevo — nalozi', 'IN_PROGRESS', 'MEDIUM', 9, 18],
    ['t_general', 'opsti-zahtjev', 'Molim premještaj telefonske ekstenzije', 'RESOLVED', 'LOW', 10, 40],
    ['t_vpn_old', 'vpn-pristup', 'Ne mogu se spojiti na VPN od kuće', 'CLOSED', 'CRITICAL', 11, 120],
  ];
  for (const [key, slug, title, status, priority, requesterIndex, ageHours] of tickets) {
    const person = requester(requesterIndex);
    const service = services.get(slug);
    const rule = context.slaMinutes.get(`${service.sla}:${priority}`);
    const createdAt = hoursAgo(ageHours);
    const done = status === 'RESOLVED' || status === 'CLOSED';
    await insert(client, 'Ticket', {
      id: seedId(key),
      ticketNumber: nextNumber(),
      title,
      description: title,
      status,
      priority,
      impact: priority === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      urgency: priority === 'LOW' ? 'LOW' : 'MEDIUM',
      originUnitId: person.organizationalUnitId,
      serviceId: service.id,
      formVersionId: service.formId,
      requesterId: person.id,
      assignedGroupId: context.group(service.groupKey).id,
      assignedUserId: status === 'PENDING_APPROVAL' ? null : context.agents.desk.id,
      formData: {},
      closeCodeId: done ? seedId('close_rijeseno') : null,
      resolutionNote: done ? 'Primijenjeno rješenje i potvrđeno sa korisnikom.' : null,
      resolvedAt: done ? hoursAgo(ageHours / 2) : null,
      closedAt: status === 'CLOSED' ? hoursAgo(Math.max(ageHours / 3, 1)) : null,
      firstResponseAt: status === 'PENDING_APPROVAL' ? null : hoursAgo(ageHours - 1),
      createdAt,
      updatedAt: new Date(),
    });
    await insert(client, 'TicketParticipant', {
      id: seedId(`${key}_req`),
      ticketId: seedId(key),
      role: 'REQUESTER',
      userId: person.id,
    });
    await insert(client, 'TicketSlaState', {
      id: seedId(`${key}_sla`),
      ticketId: seedId(key),
      slaProfileId: context.sla(service.sla),
      responseMinutes: rule?.response ?? 60,
      resolutionMinutes: rule?.resolution ?? 480,
      startedAt: createdAt,
      responseDueAt: new Date(createdAt.getTime() + (rule?.response ?? 60) * 60_000),
      resolutionDueAt: new Date(createdAt.getTime() + (rule?.resolution ?? 480) * 60_000),
      respondedAt: status === 'PENDING_APPROVAL' ? null : hoursAgo(ageHours - 1),
      resolutionCompletedAt: done ? hoursAgo(ageHours / 2) : null,
      nextDueAt: done ? null : daysAhead(1),
    });
  }
  await client.query(`SELECT setval('ticket_number_seq', $1, true)`, [number - 1]);
  await insert(client, 'TicketMessage', {
    id: seedId('msg_vpn'),
    ticketId: seedId('t_vpn'),
    type: 'AGENT_REPLY',
    body: 'Veza iz Visokog je na poznatom problemu. Javite da li puca i na mobilnom internetu.',
    authorUserId: context.agents.desk.id,
  });
  await insert(client, 'TicketMessage', {
    id: seedId('msg_mail'),
    ticketId: seedId('t_mail'),
    type: 'INTERNAL_NOTE',
    body: 'Poznata greška indeksa na terminalskom serveru. Ne dirati OST.',
    authorUserId: context.agents.desk.id,
  });
  await insert(client, 'TicketAsset', {
    ticketId: seedId('t_laptop'),
    assetId: seedId('asset_LAP-1001'),
    isPrimary: true,
  });
  return number;
}
