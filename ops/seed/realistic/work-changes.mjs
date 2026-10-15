import { insert, seedId } from './context.mjs';

const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000);
const daysAhead = (days) => new Date(Date.now() + days * 86_400_000);

export async function seedChanges(client, context, services) {
  await insert(client, 'ChangeTemplate', {
    id: seedId('ct_vpn'),
    name: 'Restart VPN koncentratora',
    description: 'Standardni restart van radnog vremena.',
    implementationPlan: 'Najaviti prekid, restartovati servis, provjeriti probnu sesiju.',
    backoutPlan: 'Vratiti prethodni snapshot virtuelne mašine.',
    impact: 'LOW',
    likelihood: 'LOW',
  });
  await insert(client, 'ChangeTemplateService', {
    templateId: seedId('ct_vpn'),
    serviceId: services.get('vpn-pristup').id,
  });
  await insert(client, 'ChangeSequence', { id: 1, lastNumber: 3 });
  await insert(client, 'ChangeRequest', {
    id: seedId('ch_vpn'),
    sequence: 1,
    title: 'Restart VPN koncentratora',
    description: 'Kratki restart poslije degradacije iz Visokog.',
    reason: 'Sesije padaju i ne oporavljaju se same.',
    type: 'STANDARD',
    status: 'SCHEDULED',
    organizationalUnitId: context.itUnitId,
    templateId: seedId('ct_vpn'),
    ownerUserId: context.agents.desk.id,
    requesterUserId: context.agents.desk.id,
    plannedStart: daysAhead(2),
    plannedEnd: daysAhead(2),
  });
  await insert(client, 'ChangeRequestService', {
    changeId: seedId('ch_vpn'),
    serviceId: services.get('vpn-pristup').id,
  });
  await insert(client, 'ChangeRequest', {
    id: seedId('ch_mail'),
    sequence: 2,
    title: 'Nadogradnja poštanskog servera',
    description: 'Sigurnosna zakrpa VM-MAIL-01.',
    reason: 'Istekao je rok za zakrpu.',
    type: 'NORMAL',
    status: 'AUTHORIZATION',
    organizationalUnitId: context.itUnitId,
    cabGroupId: context.group('cab-grupa').id,
    ownerUserId: context.agents.desk.id,
    requesterUserId: context.agents.cab.id,
    plannedStart: daysAhead(7),
    plannedEnd: daysAhead(7),
    causesDowntime: true,
  });
  await insert(client, 'ChangeApproval', {
    id: seedId('ch_mail_vote'),
    changeId: seedId('ch_mail'),
    round: 1,
    approverUserId: context.agents.cab.id,
    decision: 'PENDING',
  });
  await insert(client, 'ChangeRequestService', {
    changeId: seedId('ch_mail'),
    serviceId: services.get('posta').id,
  });
  await insert(client, 'ChangeRequest', {
    id: seedId('ch_ups'),
    sequence: 3,
    title: 'Zamjena UPS-a u server sali',
    description: 'Stari UPS je zamijenjen naručenim uređajem.',
    reason: 'Baterije ne drže opterećenje.',
    type: 'NORMAL',
    status: 'CLOSED',
    outcome: 'SUCCESSFUL',
    organizationalUnitId: context.itUnitId,
    ownerUserId: context.agents.equipment.id,
    requesterUserId: context.agents.equipment.id,
    closedAt: hoursAgo(24),
  });
  await insert(client, 'ChangeRequestAsset', {
    changeId: seedId('ch_ups'),
    assetId: seedId('asset_OST-001'),
  });
  const onCallGroup = context.group('it-podr-ka-l1').id;
  await insert(client, 'OnCallSchedule', {
    id: seedId('oncall_l1'),
    groupId: onCallGroup,
    timezone: 'Europe/Sarajevo',
    handoffMinute: 480,
    rotationLength: 'WEEK',
    rotationStartDate: '2026-10-12',
    isActive: true,
    ownerUserId: context.agents.desk.id,
  });
  const members = await client.query(
    `SELECT "userId" FROM "GroupMember" WHERE "groupId" = $1 ORDER BY "userId"`,
    [onCallGroup],
  );
  for (const [index, member] of members.rows.entries()) {
    await insert(client, 'OnCallRotationMember', {
      id: seedId(`oncall_m_${index}`),
      scheduleId: seedId('oncall_l1'),
      userId: member.userId,
      position: index,
    });
  }
  await insert(client, 'Announcement', {
    id: seedId('ann_vpn'),
    title: 'Prekid VPN-a u subotu',
    body: 'U subotu od 02:00 do 04:00 VPN neće raditi zbog restarta koncentratora. Pošta i poslovni sistem rade.',
    severity: 'WARNING',
    displayMode: 'MODAL',
    requiresAcknowledgement: true,
    status: 'PUBLISHED',
    startsAt: new Date(),
    endsAt: daysAhead(6),
    publishedAt: new Date(),
    publishedById: context.agents.desk.id,
    serviceId: services.get('vpn-pristup').id,
    version: 1,
  });
  await insert(client, 'Announcement', {
    id: seedId('ann_kb'),
    title: 'Nove upute u bazi znanja',
    body: 'Objavljene su upute za VPN, reset lozinke, Outlook pretragu i zaglavljen štampač.',
    severity: 'INFO',
    displayMode: 'BANNER',
    status: 'PUBLISHED',
    startsAt: new Date(),
    endsAt: daysAhead(30),
    publishedAt: new Date(),
    publishedById: context.agents.desk.id,
    version: 1,
  });
  await insert(client, 'ServiceIncident', {
    id: seedId('inc_vpn'),
    title: 'Degradiran VPN iz Visokog',
    impact: 'DEGRADED',
    status: 'IDENTIFIED',
    visibility: 'ALL_USERS',
    startedAt: hoursAgo(20),
    createdByUserId: context.agents.desk.id,
  });
  await insert(client, 'ServiceIncidentService', {
    incidentId: seedId('inc_vpn'),
    serviceId: services.get('vpn-pristup').id,
  });
  await insert(client, 'ServiceIncidentUpdate', {
    id: seedId('inc_vpn_note'),
    incidentId: seedId('inc_vpn'),
    status: 'IDENTIFIED',
    message: 'Problem je na pristupnoj liniji poslovnice. Restart koncentratora je zakazan.',
    authorUserId: context.agents.desk.id,
  });
  await insert(client, 'TicketIncidentLink', {
    ticketId: seedId('t_vpn'),
    incidentId: seedId('inc_vpn'),
  });
  await insert(client, 'ProblemIncident', {
    problemId: seedId('pr_vpn'),
    incidentId: seedId('inc_vpn'),
  });
  await insert(client, 'ServiceIncident', {
    id: seedId('inc_erp'),
    title: 'Najavljeno održavanje poslovnog sistema',
    impact: 'MAINTENANCE',
    status: 'INVESTIGATING',
    visibility: 'STAFF_ONLY',
    startedAt: daysAhead(6),
    createdByUserId: context.agents.desk.id,
  });
  await insert(client, 'ServiceIncidentService', {
    incidentId: seedId('inc_erp'),
    serviceId: services.get('poslovni-sistem').id,
  });
}
