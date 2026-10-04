import {
  assertResponseTemplateUsable,
  templateKindFits,
  templateKindForMessageType,
} from './assert-response-template-usable';
import { TemplatesError } from './templates.error';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type Row = { id: string; kind: string; isActive: boolean; ownerUserId: string | null };

function fakePrisma(row: Row | null) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    prisma: {
      responseTemplate: {
        findFirst: async (args: Record<string, unknown>) => {
          calls.push(args);
          if (row === null) return null;
          const where = args.where as { OR?: Array<{ ownerUserId: string | null }> };
          const owner = where.OR?.[1]?.ownerUserId;
          if (row.ownerUserId !== null && row.ownerUserId !== owner) return null;
          return { id: row.id, kind: row.kind, isActive: row.isActive };
        },
      },
    } as never,
  };
}

async function codeOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    return error instanceof TemplatesError ? error.code : 'OTHER';
  }
  return undefined;
}

/**
 * Val 2 (M13/B1): the picker only showed active templates of the right kind,
 * but the server accepted any id. These tests pin the server-side rule down.
 */
describe('assertResponseTemplateUsable', () => {
  const actor = 'agent-1';

  it('propušta prazan id i klijenta bez šablona (memorijski prisma)', async () => {
    const { prisma } = fakePrisma(null);
    await expect(
      assertResponseTemplateUsable(prisma, { templateId: undefined, actorUserId: actor }),
    ).resolves.toBeNull();
    await expect(
      assertResponseTemplateUsable(prisma, { templateId: '   ', actorUserId: actor }),
    ).resolves.toBeNull();
    // Bez delegata (npr. in-memory harness) nema šta provjeravati — ne puca.
    await expect(
      assertResponseTemplateUsable({} as never, { templateId: 'tpl-1', actorUserId: actor }),
    ).resolves.toBeNull();
  });

  it('traži šablon koji postoji i pripada akteru ili je zajednički', async () => {
    const { prisma } = fakePrisma(null);
    expect(
      await codeOf(() =>
        assertResponseTemplateUsable(prisma, { templateId: 'tpl-1', actorUserId: actor }),
      ),
    ).toBe('TEMPLATE_NOT_FOUND');

    const foreign = fakePrisma({
      id: 'tpl-2',
      kind: 'REPLY',
      isActive: true,
      ownerUserId: 'other-agent',
    });
    expect(
      await codeOf(() =>
        assertResponseTemplateUsable(foreign.prisma, {
          templateId: 'tpl-2',
          actorUserId: actor,
        }),
      ),
    ).toBe('TEMPLATE_NOT_FOUND');

    const own = fakePrisma({
      id: 'tpl-3',
      kind: 'REPLY',
      isActive: true,
      ownerUserId: actor,
    });
    await expect(
      assertResponseTemplateUsable(own.prisma, { templateId: 'tpl-3', actorUserId: actor }),
    ).resolves.toMatchObject({ id: 'tpl-3' });
  });

  it('odbija deaktiviran šablon i šablon pogrešnog tipa', async () => {
    const inactive = fakePrisma({
      id: 'tpl-old',
      kind: 'REPLY',
      isActive: false,
      ownerUserId: null,
    });
    expect(
      await codeOf(() =>
        assertResponseTemplateUsable(inactive.prisma, {
          templateId: 'tpl-old',
          actorUserId: actor,
        }),
      ),
    ).toBe('TEMPLATE_INACTIVE');

    const internal = fakePrisma({
      id: 'tpl-int',
      kind: 'INTERNAL',
      isActive: true,
      ownerUserId: null,
    });
    expect(
      await codeOf(() =>
        assertResponseTemplateUsable(internal.prisma, {
          templateId: 'tpl-int',
          actorUserId: actor,
          kind: 'REPLY',
        }),
      ),
    ).toBe('TEMPLATE_KIND_MISMATCH');
    // Interna bilješka smije koristiti INTERNAL šablon.
    await expect(
      assertResponseTemplateUsable(internal.prisma, {
        templateId: 'tpl-int',
        actorUserId: actor,
        kind: 'INTERNAL',
      }),
    ).resolves.toMatchObject({ id: 'tpl-int' });
  });

  it('ANY odgovara oba režima, a tip poruke bira režim', () => {
    expect(templateKindFits('ANY', 'REPLY')).toBe(true);
    expect(templateKindFits('ANY', 'INTERNAL')).toBe(true);
    expect(templateKindFits('REPLY', 'INTERNAL')).toBe(false);
    expect(templateKindFits('INTERNAL', 'REPLY')).toBe(false);
    expect(templateKindForMessageType('AGENT_REPLY')).toBe('REPLY');
    expect(templateKindForMessageType('USER_REPLY')).toBe('REPLY');
    expect(templateKindForMessageType('INTERNAL_NOTE')).toBe('INTERNAL');
  });
});
