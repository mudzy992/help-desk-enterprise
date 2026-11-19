import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

/**
 * W7.61 (BA-search-07): audit 27 §7 objected that the two `contains` scans of
 * `GET /search` — the directory (`User.displayName` / `User.email`) and the
 * knowledge-base title — had **no query-plan evidence**. This suite is that
 * evidence, measured on the real schema inside the CI PostgreSQL service.
 *
 * What it proves, and why it is written this way:
 *
 * 1. The SQL explained here is the SQL Prisma issues for the module's own
 *    `findMany` calls (same columns, same `ILIKE` predicate, same order and
 *    `LIMIT`); the suite also runs both the Prisma query and the raw statement
 *    and asserts they return the same rows, so the plan cannot describe a
 *    different query than the module runs.
 * 2. The knowledge-base title has a `gin_trgm_ops` index
 *    (`KnowledgeArticle_title_trgm_idx`, migration
 *    `20260923140000_search_trigram_indexes`). The measurement asserts the
 *    planner **uses** it and that the number of rows read stays far below the
 *    corpus — i.e. the design works, it was only never proven.
 * 3. The directory has **no** trigram index: `email` is a unique B-tree, which
 *    cannot answer a leading wildcard. The assertion is therefore adaptive: it
 *    reads `pg_indexes` and requires a full scan while no trigram index exists,
 *    and a bounded read once one does. Adding it is a migration and needs
 *    explicit approval, so the package documents the measurement and the DDL
 *    instead of shipping an unapproved schema change.
 */
describeIfDatabase('search query plans (W7.61, BA-search-07)', () => {
  jest.setTimeout(300_000);

  /** Big enough that the planner weighs an index against a sequential scan. */
  const corpus = 12_000;
  const batch = 1_500;
  const userNeedle = 'korisnik 00042';
  const articleNeedle = 'procedura 00042 za';
  const stamp = Date.now();

  let prisma: PrismaClient;
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
    readonly 'Actual Rows Removed by Filter'?: number;
    readonly 'Actual Loops'?: number;
  };
  type PlanDocument = {
    readonly Plan: PlanNode;
    readonly 'Planning Time': number;
    readonly 'Execution Time': number;
  };

  const flatten = (
    node: PlanNode,
    into: PlanNode[] = [],
  ): PlanNode[] => {
    into.push(node);
    for (const child of node.Plans ?? []) {
      flatten(child, into);
    }
    return into;
  };

  const explain = async (
    sql: string,
    ...parameters: readonly unknown[]
  ): Promise<PlanDocument> => {
    const rows = (await prisma.$queryRawUnsafe(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
      ...parameters,
    )) as unknown as Record<string, unknown>[];
    // `FORMAT JSON` answers one row whose single column (`QUERY PLAN`) holds an
    // array with one document. Unwrapping is defensive because a driver may
    // return the parsed array directly.
    const first = rows[0];
    if (first === undefined) {
      throw new Error('EXPLAIN je vratio prazan plan');
    }
    const column = (first['QUERY PLAN'] ?? first) as unknown;
    const documents = (Array.isArray(column) ? column : [column]) as PlanDocument[];
    const document = documents[0];
    if (document === undefined || document.Plan === undefined) {
      throw new Error('EXPLAIN nije vratio Plan dokument');
    }
    return document;
  };

  /**
   * Rows the plan actually **examined** on `relation`. `Actual Rows` is what the
   * node returned, which for a selective filter on a whole-table scan is one —
   * the number that matters here is what the scan had to look at, so rows
   * removed by the filter are added back (per loop).
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
          ((node['Actual Rows'] ?? 0) +
            (node['Actual Rows Removed by Filter'] ?? 0)) *
            (node['Actual Loops'] ?? 1),
        0,
      );

  const nodesOn = (document: PlanDocument, relation: string): PlanNode[] =>
    flatten(document.Plan).filter(
      (node) => node['Relation Name'] === relation,
    );

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
    await prisma.$executeRawUnsafe('ANALYZE "User"');
    await prisma.$executeRawUnsafe('ANALYZE "KnowledgeArticle"');
  });

  afterAll(async () => {
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

  it('measures the directory scan and records whether a trigram index serves it', async () => {
    const document = await explain(usersSql, `%${userNeedle}%`, 15);
    const rows = rowsReadFrom(document, 'User');
    const trigramIndexes = (await prisma.$queryRawUnsafe(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'User' AND indexdef ILIKE '%gin_trgm_ops%'`,
    )) as unknown as { readonly indexdef: string }[];

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
    const rawRows = (await prisma.$queryRawUnsafe(
      usersSql,
      `%${userNeedle}%`,
      15,
    )) as unknown as { readonly id: string }[];
    expect(rawRows.map((row) => row.id)).toEqual(
      throughPrisma.map((row: { readonly id: string }) => row.id),
    );

    console.log(
      `search query plan (users): rows_read=${rows}/${corpus} ` +
        `trigram_index=${trigramIndexes.length > 0 ? 'present' : 'absent'} ` +
        `execution_ms=${document['Execution Time'].toFixed(1)} ` +
        `nodes=${nodesOn(document, 'User')
          .map((node) => node['Node Type'])
          .join('/')}`,
    );

    if (trigramIndexes.length === 0) {
      // No index can answer `ILIKE '%needle%'`: the directory is read whole,
      // which is the finding. The predicate is a filter, not an index condition.
      expect(rows).toBeGreaterThanOrEqual(corpus * 0.5);
      expect(
        nodesOn(document, 'User').some((node) =>
          (node.Filter ?? '').includes('~~*'),
        ),
      ).toBe(true);
    } else {
      // Once the migration is approved this branch documents the improvement.
      expect(rows).toBeLessThan(corpus * 0.5);
    }
    expect(document['Execution Time']).toBeLessThan(5_000);
  });

  it('proves the knowledge-base title uses its trigram index', async () => {
    const document = await explain(articlesSql, `%${articleNeedle}%`, 51);
    const rows = rowsReadFrom(document, 'KnowledgeArticle');
    const indexNodes = flatten(document.Plan).filter(
      (node) => node['Index Name'] === 'KnowledgeArticle_title_trgm_idx',
    );

    const throughPrisma = await prisma.knowledgeArticle.findMany({
      where: {
        title: { contains: articleNeedle, mode: 'insensitive' },
        status: { not: 'ARCHIVED' },
      },
      select: { id: true, slug: true, title: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 51,
    });
    const rawRows = (await prisma.$queryRawUnsafe(
      articlesSql,
      `%${articleNeedle}%`,
      51,
    )) as unknown as { readonly id: string }[];
    expect(rawRows.map((row) => row.id)).toEqual(
      throughPrisma.map((row: { readonly id: string }) => row.id),
    );

    console.log(
      `search query plan (articles): rows_read=${rows}/${corpus} ` +
        `index=${indexNodes.length > 0 ? 'KnowledgeArticle_title_trgm_idx' : 'none'} ` +
        `execution_ms=${document['Execution Time'].toFixed(1)} ` +
        `nodes=${nodesOn(document, 'KnowledgeArticle')
          .map((node) => node['Node Type'])
          .join('/')}`,
    );

    // The index exists in the schema; the measurement is that the planner uses
    // it, and that the read stays proportional to the hits instead of the corpus.
    expect(indexNodes.length).toBeGreaterThan(0);
    expect(rows).toBeLessThan(corpus * 0.2);
    expect(document['Execution Time']).toBeLessThan(5_000);
  });
});
