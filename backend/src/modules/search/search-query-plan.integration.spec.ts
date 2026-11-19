import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { PrismaClient } from '../../generated/prisma/client';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/**
 * W7.61 (BA-search-07): audit 27 §7 objected that the two `contains` scans of
 * `GET /search` — the directory (`User.displayName` / `User.email`) and the
 * knowledge-base title — had **no query-plan evidence**. This suite is that
 * evidence, measured on the real schema inside the CI PostgreSQL service.
 *
 * How it stays honest:
 *
 * 1. The explained SQL is the statement Prisma issues for the module's own
 *    `findMany` calls (same columns, same `ILIKE` predicate, same order and
 *    `LIMIT`), and each test also runs the Prisma query and asserts both return
 *    the same rows — the plan cannot describe a query the module does not run.
 * 2. `rows examined` is `Actual Rows + Rows Removed by Filter` per loop, not the
 *    rows the node returned: a selective filter on a whole-table scan returns
 *    one row after looking at every row, and it is the second number that is the
 *    cost.
 * 3. Indexability is proven **both** ways for both scans: the indexes are read
 *    from `pg_indexes`, and the same statement is planned once with the default
 *    cost model and once with `enable_seqscan = off`. That separates "the index
 *    can serve this predicate" (a schema property) from "the planner prefers the
 *    scan at this corpus size" (a cost decision that changes with table size).
 *    Since W7.63 the directory has trigram indexes too (`User_displayName_*`,
 *    `User_email_*`), so this suite measures the schema the deployment has — it
 *    no longer documents a missing index, it guards the ones that exist.
 *
 * The plans run on one dedicated `pg` client, not through the Prisma pool: a
 * session-level `SET enable_seqscan = off` must land on the same backend as the
 * `EXPLAIN` that follows it.
 */
describeIfDatabase('search query plans (W7.61, BA-search-07)', () => {
  jest.setTimeout(300_000);

  /** Big enough that a cost decision is visible, small enough for CI time. */
  const corpus = 12_000;
  const batch = 1_500;
  const userNeedle = 'korisnik 00042';
  const articleNeedle = 'procedura 00042 za';
  const stamp = Date.now();

  let prisma: PrismaClient;
  let client: Client;
  let unitId: string;
  let serviceId: string;
  let categoryId: string;

  type PlanNode = {
    readonly 'Node Type': string;
    readonly 'Relation Name'?: string;
    readonly 'Index Name'?: string;
    readonly Filter?: string;
    readonly Plans?: readonly PlanNode[];
    readonly 'Actual Rows'?: number;
    readonly 'Rows Removed by Filter'?: number;
    readonly 'Actual Loops'?: number;
  };
  type PlanDocument = {
    readonly Plan: PlanNode;
    readonly 'Planning Time': number;
    readonly 'Execution Time': number;
  };

  const flatten = (node: PlanNode, into: PlanNode[] = []): PlanNode[] => {
    into.push(node);
    for (const child of node.Plans ?? []) {
      flatten(child, into);
    }
    return into;
  };

  const explain = async (
    sql: string,
    parameters: readonly unknown[],
  ): Promise<PlanDocument> => {
    const result = await client.query<Record<string, unknown>>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
      parameters as unknown[],
    );
    const first = result.rows[0];
    if (first === undefined) {
      throw new Error('EXPLAIN je vratio prazan plan');
    }
    // `FORMAT JSON` answers one row whose single column holds a one-element
    // array; a driver may also hand back the array directly.
    const column = (first['QUERY PLAN'] ?? first) as unknown;
    const documents = (Array.isArray(column) ? column : [column]) as PlanDocument[];
    const document = documents[0];
    if (document === undefined || document.Plan === undefined) {
      throw new Error('EXPLAIN nije vratio Plan dokument');
    }
    return document;
  };

  /**
   * Rows the plan actually **examined** on `relation`: what the scan returned
   * plus what its filter threw away, per loop.
   */
  const rowsReadFrom = (document: PlanDocument, relation: string): number =>
    flatten(document.Plan)
      .filter(
        (node) =>
          node['Relation Name'] === relation &&
          node['Node Type'].endsWith('Scan'),
      )
      .reduce(
        (total, node) =>
          total +
          ((node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0)) *
            (node['Actual Loops'] ?? 1),
        0,
      );

  const nodesOn = (document: PlanDocument, relation: string): PlanNode[] =>
    flatten(document.Plan).filter((node) => node['Relation Name'] === relation);

  const indexDefinitions = async (table: string): Promise<string[]> => {
    const result = await client.query<{ readonly indexdef: string }>(
      'SELECT indexdef FROM pg_indexes WHERE tablename = $1',
      [table],
    );
    return result.rows.map((row) => row.indexdef);
  };

  const usersSql = `
    SELECT "User"."id", "User"."displayName", "User"."email"
    FROM "User"
    WHERE "User"."isActive" = true
      AND ("User"."displayName" ILIKE $1 OR "User"."email" ILIKE $1)
    ORDER BY "User"."displayName" ASC
    LIMIT $2`;

  const articlesSql = `
    SELECT "KnowledgeArticle"."id", "KnowledgeArticle"."slug", "KnowledgeArticle"."title"
    FROM "KnowledgeArticle"
    WHERE "KnowledgeArticle"."title" ILIKE $1
      AND "KnowledgeArticle"."status" <> 'ARCHIVED'
    ORDER BY "KnowledgeArticle"."updatedAt" DESC, "KnowledgeArticle"."id" ASC
    LIMIT $2`;

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    client = new Client({ connectionString: url! });
    await client.connect();

    const unit = await prisma.organizationalUnit.create({
      data: {
        name: `Plan ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=PLAN${stamp}`,
        ouPath: `/plan${stamp}`,
      },
    });
    unitId = unit.id;
    const category = await prisma.serviceCategory.create({
      data: { name: `Plan ${stamp}`, slug: `plan-cat-${stamp}` },
    });
    categoryId = category.id;
    const service = await prisma.service.create({
      data: {
        name: `Plan ${stamp}`,
        slug: `plan-svc-${stamp}`,
        categoryId: category.id,
        lifecycle: 'ACTIVE',
      },
    });
    serviceId = service.id;

    for (let offset = 0; offset < corpus; offset += batch) {
      const size = Math.min(batch, corpus - offset);
      await prisma.user.createMany({
        data: Array.from({ length: size }, (_, index) => {
          const ordinal = String(offset + index + 1).padStart(5, '0');
          return {
            email: `plan-search-${stamp}-${ordinal}@example.test`,
            displayName: `Korisnik ${ordinal} Plan`,
            isActive: true,
            organizationalUnitId: unit.id,
          };
        }),
      });
      await prisma.knowledgeArticle.createMany({
        data: Array.from({ length: size }, (_, index) => {
          const ordinal = String(offset + index + 1).padStart(5, '0');
          return {
            slug: `plan-search-${stamp}-${ordinal}`,
            title: `Procedura ${ordinal} za pristup`,
            body: 'Tijelo članka koje pretraga naslova ne čita.',
            status: 'PUBLISHED' as const,
            classification: 'INTERNAL' as const,
            serviceId: service.id,
            organizationalUnitId: unit.id,
            updatedAt: new Date(1_760_000_000_000 + offset + index),
          };
        }),
      });
    }
    // Without fresh statistics the planner would compare against whatever the
    // template database had, and the plan would not describe this corpus.
    await client.query('ANALYZE "User"');
    await client.query('ANALYZE "KnowledgeArticle"');
  });

  afterAll(async () => {
    await client?.end().catch(() => undefined);
    if (prisma === undefined) {
      return;
    }
    await prisma.knowledgeArticle
      .deleteMany({ where: { serviceId } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { email: { startsWith: `plan-search-${stamp}-` } } })
      .catch(() => undefined);
    await prisma.service.delete({ where: { id: serviceId } }).catch(() => undefined);
    await prisma.serviceCategory
      .delete({ where: { id: categoryId } })
      .catch(() => undefined);
    await prisma.organizationalUnit
      .delete({ where: { id: unitId } })
      .catch(() => undefined);
    await prisma.$disconnect();
  });

  it('serves the directory predicate with the trigram indexes it now has', async () => {
    // W7.63: the indexes proposed by W7.61 are applied, so the directory scan
    // is measured against the schema the deployment actually has.
    const definitions = await indexDefinitions('User');
    expect(
      definitions.some((definition) => definition.includes('"User_displayName_trgm_idx"')),
    ).toBe(true);
    expect(
      definitions.some((definition) => definition.includes('"User_email_trgm_idx"')),
    ).toBe(true);

    // The explained statement is the module's own query, not a look-alike.
    const throughPrisma = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { displayName: { contains: userNeedle, mode: 'insensitive' } },
          { email: { contains: userNeedle, mode: 'insensitive' } },
        ],
      },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: 'asc' },
      take: 15,
    });
    const rawRows = await client.query<{ readonly id: string }>(usersSql, [
      `%${userNeedle}%`,
      15,
    ]);
    expect(rawRows.rows.map((row) => row.id)).toEqual(
      throughPrisma.map((row: { readonly id: string }) => row.id),
    );

    // 1. Default cost model: record what actually runs at this corpus size.
    const planned = await explain(usersSql, [`%${userNeedle}%`, 15]);
    console.log(
      `search query plan (users, default): ` +
        `examined=${rowsReadFrom(planned, 'User')}/${corpus} ` +
        `execution_ms=${planned['Execution Time'].toFixed(1)} ` +
        `nodes=${nodesOn(planned, 'User')
          .map((node) => node['Node Type'])
          .join('/')}`,
    );
    expect(rowsReadFrom(planned, 'User')).toBeLessThanOrEqual(corpus);
    expect(planned['Execution Time']).toBeLessThan(5_000);

    // 2. Same statement with the scan penalised: the trigram index must take
    //    over, and the read must be hit-proportional instead of table-sized.
    await client.query('SET enable_seqscan = off');
    try {
      const indexed = await explain(usersSql, [`%${userNeedle}%`, 15]);
      const indexNodes = flatten(indexed.Plan).filter((node) =>
        (node['Index Name'] ?? '').startsWith('User_'),
      );
      console.log(
        `search query plan (users, index-only): ` +
          `examined=${rowsReadFrom(indexed, 'User')}/${corpus} ` +
          `execution_ms=${indexed['Execution Time'].toFixed(1)} ` +
          `indexes=${indexNodes
            .map((node) => node['Index Name'])
            .join(',')}`,
      );
      expect(indexNodes.length).toBeGreaterThan(0);
      expect(rowsReadFrom(indexed, 'User')).toBeLessThan(corpus * 0.2);
    } finally {
      await client.query('SET enable_seqscan = on');
    }
  });

  it('proves the knowledge-base title can be served by its trigram index', async () => {
    const definitions = await indexDefinitions('KnowledgeArticle');
    expect(
      definitions.some((definition) =>
        definition.includes('KnowledgeArticle_title_trgm_idx'),
      ),
    ).toBe(true);

    const throughPrisma = await prisma.knowledgeArticle.findMany({
      where: {
        title: { contains: articleNeedle, mode: 'insensitive' },
        status: { not: 'ARCHIVED' },
      },
      select: { id: true, slug: true, title: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 51,
    });
    const rawRows = await client.query<{ readonly id: string }>(
      articlesSql,
      [`%${articleNeedle}%`, 51],
    );
    expect(rawRows.rows.map((row) => row.id)).toEqual(
      throughPrisma.map((row: { readonly id: string }) => row.id),
    );

    // 1. Default cost model: measure what actually runs.
    const planned = await explain(articlesSql, [`%${articleNeedle}%`, 51]);
    console.log(
      `search query plan (articles, default): ` +
        `examined=${rowsReadFrom(planned, 'KnowledgeArticle')}/${corpus} ` +
        `execution_ms=${planned['Execution Time'].toFixed(1)} ` +
        `nodes=${nodesOn(planned, 'KnowledgeArticle')
          .map((node) => node['Node Type'])
          .join('/')}`,
    );
    expect(rowsReadFrom(planned, 'KnowledgeArticle')).toBeLessThanOrEqual(corpus);
    expect(planned['Execution Time']).toBeLessThan(5_000);

    // 2. Same statement with the scan penalised: the index must take over. A
    //    default plan that prefers the scan at 12k rows is a cost decision, not
    //    a missing index — and the difference is exactly what the audit wanted
    //    to be able to see.
    await client.query('SET enable_seqscan = off');
    try {
      const indexed = await explain(articlesSql, [`%${articleNeedle}%`, 51]);
      const indexNodes = flatten(indexed.Plan).filter(
        (node) => node['Index Name'] === 'KnowledgeArticle_title_trgm_idx',
      );
      console.log(
        `search query plan (articles, index-only): ` +
          `examined=${rowsReadFrom(indexed, 'KnowledgeArticle')}/${corpus} ` +
          `execution_ms=${indexed['Execution Time'].toFixed(1)} ` +
          `index=${indexNodes.length > 0 ? 'KnowledgeArticle_title_trgm_idx' : 'none'}`,
      );
      expect(indexNodes.length).toBeGreaterThan(0);
      // A hit-proportional read instead of a corpus-proportional one.
      expect(rowsReadFrom(indexed, 'KnowledgeArticle')).toBeLessThan(corpus * 0.2);
    } finally {
      await client.query('SET enable_seqscan = on');
    }
  });
});
