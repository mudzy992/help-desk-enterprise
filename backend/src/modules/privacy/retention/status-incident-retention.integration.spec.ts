/**
 * Paket 2.6 / W6.13 (§7): status-page incident retention against real PostgreSQL.
 * Runs only when PRIVACY_IT_DATABASE_URL points at a migrated, disposable database:
 *   PRIVACY_IT_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/hd npx jest status-incident-retention.integration
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { createStatusIncidentRetentionExecutor } from './status-incident-retention.executor';
import { retentionRedactionMarker } from './retention-executors';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;
const day = 86_400_000;

describeIfDatabase('status-incident retention (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  const now = new Date();
  const resolvedLongAgo = new Date(now.getTime() - 400 * day); // 400 days ago
  const resolvedRecently = new Date(now.getTime() - 10 * day); // 10 days ago

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('archives old resolved incidents and redacts their content', async () => {
    // A user whose personal data appears on the incident and its updates.
    const author = await prisma.user.create({
      data: { email: `author${Date.now()}@x.ba`, displayName: 'Author Ime' },
    });
    const subscriber = await prisma.user.create({
      data: { email: `sub${Date.now()}@x.ba`, displayName: 'Sub Ime' },
    });

    // An OU and service to link the incident to.
    const unit = await prisma.organizationalUnit.create({
      data: { name: 'OU', type: 'DIRECTORATE', distinguishedName: `OU=${Date.now()}`, ouPath: `/u${Date.now()}` },
    });
    const category = await prisma.serviceCategory.create({ data: { name: 'C', slug: `c${Date.now()}` } });
    const service = await prisma.service.create({
      data: { name: 'S', slug: `s${Date.now()}`, categoryId: category.id },
    });

    // Incident resolved long ago — due for retention.
    const oldIncident = await prisma.serviceIncident.create({
      data: {
        title: 'Stari incident',
        titleEn: 'Old incident',
        impact: 'DOWN',
        status: 'RESOLVED',
        visibility: 'ALL_USERS',
        startedAt: new Date(resolvedLongAgo.getTime() - day),
        resolvedAt: resolvedLongAgo,
        createdByUserId: author.id,
      },
    });

    // Incident resolved recently — not due.
    const recentIncident = await prisma.serviceIncident.create({
      data: {
        title: 'Novi incident',
        titleEn: 'Recent incident',
        impact: 'DEGRADED',
        status: 'RESOLVED',
        visibility: 'ALL_USERS',
        startedAt: new Date(resolvedRecently.getTime() - day),
        resolvedAt: resolvedRecently,
        createdByUserId: author.id,
      },
    });

    // Already archived — must be skipped.
    const archivedIncident = await prisma.serviceIncident.create({
      data: {
        title: 'Arhivisan',
        titleEn: 'Archived',
        impact: 'DOWN',
        status: 'RESOLVED',
        visibility: 'ALL_USERS',
        startedAt: new Date(resolvedLongAgo.getTime() - day),
        resolvedAt: resolvedLongAgo,
        createdByUserId: author.id,
        retentionArchivedAt: now,
      },
    });

    // Timeline updates.
    await prisma.serviceIncidentUpdate.create({
      data: { incidentId: oldIncident.id, status: 'INVESTIGATING', message: 'Poruka autora ' + author.displayName, authorUserId: author.id, createdAt: resolvedLongAgo },
    });
    await prisma.serviceIncidentUpdate.create({
      data: { incidentId: recentIncident.id, status: 'INVESTIGATING', message: 'Jeszcze aktuelno', authorUserId: author.id, createdAt: resolvedRecently },
    });

    // Ticket link on old incident.
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TK-${Date.now()}`,
        title: 'Povezani tiket',
        description: 'Opis',
        formData: {},
        priority: 'LOW',
        impact: 'LOW',
        urgency: 'LOW',
        originUnitId: unit.id,
        serviceId: service.id,
        requesterId: author.id,
        status: 'CLOSED',
        closedAt: resolvedLongAgo,
      },
    });
    await prisma.ticketIncidentLink.create({
      data: { ticketId: ticket.id, incidentId: oldIncident.id, linkedByUserId: author.id },
    });

    // Subscription on old incident.
    await prisma.serviceIncidentSubscription.create({
      data: { incidentId: oldIncident.id, userId: subscriber.id, createdAt: resolvedLongAgo },
    });

    const cutoff = new Date(now.getTime() - 180 * day);
    const executor = createStatusIncidentRetentionExecutor(prisma);

    const preview = await executor.preview(cutoff);
    expect(preview.count).toBeGreaterThan(0);

    const batch = await executor.executeBatch(cutoff);
    expect(batch.items).toBeGreaterThan(0);
    expect(batch.done).toBe(true);

    // Old incident: title/author redacted, retentionArchivedAt set.
    const archived = await prisma.serviceIncident.findUnique({ where: { id: oldIncident.id } });
    expect(archived!.title).toBe(retentionRedactionMarker);
    expect(archived!.titleEn).toBeNull();
    expect(archived!.createdByUserId).toBeNull();
    expect(archived!.retentionArchivedAt).not.toBeNull();

    // Recent incident: untouched.
    const stillRecent = await prisma.serviceIncident.findUnique({ where: { id: recentIncident.id } });
    expect(stillRecent!.title).toBe('Novi incident');
    expect(stillRecent!.retentionArchivedAt).toBeNull();

    // Already archived: untouched.
    const stillArchived = await prisma.serviceIncident.findUnique({ where: { id: archivedIncident.id } });
    expect(stillArchived!.title).toBe('Arhivisan');
    expect(stillArchived!.retentionArchivedAt).toBe(now);

    // Update on old incident: message/author redacted.
    const oldUpdate = await prisma.serviceIncidentUpdate.findFirst({
      where: { incidentId: oldIncident.id },
    });
    expect(oldUpdate!.message).toBe(retentionRedactionMarker);
    expect(oldUpdate!.authorUserId).toBeNull();
    expect(oldUpdate!.contentRedactedAt).not.toBeNull();

    // Ticket link removed.
    const link = await prisma.ticketIncidentLink.findUnique({
      where: { ticketId_incidentId: { ticketId: ticket.id, incidentId: oldIncident.id } },
    });
    expect(link).toBeNull();

    // Subscription removed.
    const sub = await prisma.serviceIncidentSubscription.findUnique({
      where: { incidentId_userId: { incidentId: oldIncident.id, userId: subscriber.id } },
    });
    expect(sub).toBeNull();
  });
});
