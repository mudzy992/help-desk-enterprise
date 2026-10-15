import { insert, seedId } from './context.mjs';
import { catalog } from './catalog-data.mjs';

const holidays = [
  ['2026-01-01', 'Nova godina'],
  ['2026-01-02', 'Nova godina'],
  ['2026-03-01', 'Dan nezavisnosti'],
  ['2026-05-01', 'Praznik rada'],
  ['2026-05-02', 'Praznik rada'],
  ['2026-11-25', 'Dan državnosti'],
  ['2026-12-25', 'Katolički Božić'],
];

export async function seedCatalog(client, context) {
  const categories = new Map();
  for (const item of catalog) {
    if (categories.has(item.category.slug)) continue;
    const id = seedId(`cat_${item.category.slug}`);
    await insert(client, 'ServiceCategory', { id, name: item.category.name, slug: item.category.slug, sortOrder: categories.size });
    categories.set(item.category.slug, id);
  }
  const services = new Map();
  for (const item of catalog) {
    const id = seedId(`svc_${item.slug}`);
    const formId = seedId(`form_${item.slug}`);
    await insert(client, 'Service', {
      id,
      name: item.name,
      slug: item.slug,
      categoryId: categories.get(item.category.slug),
      lifecycle: 'ACTIVE',
      availability: 'OPERATIONAL',
      classification: 'INTERNAL',
      requiresApproval: item.approval === true,
      slaProfileId: context.sla(item.sla),
    });
    await insert(client, 'FormVersion', {
      id: formId,
      serviceId: id,
      version: 1,
      status: 'ACTIVE',
      schema: { schemaVersion: 1, fields: item.fields },
    });
    await insert(client, 'RoutingRule', {
      id: seedId(`route_${item.slug}`),
      originUnitId: context.rootUnitId,
      serviceId: id,
      groupId: context.group(item.group).id,
    });
    services.set(item.slug, { id, formId, sla: item.sla, groupKey: item.group, name: item.name });
  }
  const calendar = await client.query(`SELECT id FROM "BusinessHoursCalendar" WHERE key = 'BH_STANDARD'`);
  const calendarId = calendar.rows[0]?.id;
  if (!calendarId) throw new Error('Nema kalendara BH_STANDARD');
  for (const [date, name] of holidays) {
    await client.query(
      `INSERT INTO "CalendarHoliday" (id, "calendarId", date, name)
       SELECT $1, $2, $3::date, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM "CalendarHoliday" WHERE "calendarId" = $2 AND date = $3::date
       )`,
      [seedId(`hol_${date}`), calendarId, date, name],
    );
  }
  const codes = [
    ['rijeseno', 'Riješeno'],
    ['zaobilazno', 'Zaobilazno rješenje'],
    ['duplikat', 'Duplikat'],
    ['nije-greska', 'Nije greška'],
  ];
  for (const [key, name] of codes) {
    await insert(client, 'CloseCode', { id: seedId(`close_${key}`), key, name, isActive: true });
  }
  return services;
}
