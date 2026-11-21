import type { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { permissionKeys } from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import type { KnowledgeArticleAccessScope } from './can-read-knowledge-article';
import {
  createReminderEligibilityCaches,
  resolveReviewReminderRecipients,
} from './review-reminder-recipients';
import type { PrismaService } from '../../common/prisma/prisma.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const scope: KnowledgeArticleAccessScope = {
  organizationalUnitId: 'ou-1',
  organizationalUnitPath: '/it',
  serviceId: 'service-1',
};

/**
 * W7.85 (`BA-knowledge-base-12`): a reminder has to reach somebody who can act on it. These specs pin the three
 * filters the sweep applies to a candidate — an active account, a resolvable authorization context and a current
 * `knowledge.article.write` in the article's OU and service — and the caches that keep the sweep from repeating
 * the membership query for every due article of the same owner group.
 */
function store(input: {
  readonly inactive?: readonly string[];
  readonly members?: Readonly<Record<string, readonly string[]>>;
}) {
  const counters = { users: 0, memberships: 0 };
  const prisma = {
    user: {
      findUnique: async (query: { readonly where: { readonly id: string } }) => {
        counters.users += 1;
        return { isActive: !(input.inactive ?? []).includes(query.where.id) };
      },
    },
    groupMember: {
      findMany: async (query: { readonly where: { readonly groupId: string } }) => {
        counters.memberships += 1;
        return (input.members?.[query.where.groupId] ?? []).map((userId) => ({ userId }));
      },
    },
  };
  return { counters, prisma: prisma as unknown as PrismaService };
}

function loaderFor(
  contexts: Readonly<Record<string, ReturnType<typeof createTestAuthorizationContext> | null>>,
): { readonly loader: AuthorizationContextLoader; readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    loader: {
      loadBySubjectId: async (subjectId: string) => {
        calls.push(subjectId);
        return contexts[subjectId] ?? null;
      },
    } as unknown as AuthorizationContextLoader,
  };
}

function writerInScope(subjectId: string) {
  return createTestAuthorizationContext({
    subjectId,
    assignments: [
      createTestAssignment({
        permissionKeys: [permissionKeys.knowledgeArticleWrite],
        organizationalUnitId: 'ou-1',
        organizationalUnitPath: '/it',
        serviceId: 'service-1',
      }),
    ],
  });
}

describe('resolveReviewReminderRecipients (W7.85)', () => {
  it('keeps an owner who is active and may write in the article scope', async () => {
    const fake = store({});
    const { loader } = loaderFor({ 'user-owner': writerInScope('user-owner') });

    await expect(
      resolveReviewReminderRecipients({
        prisma: fake.prisma,
        loader,
        article: { ownerUserId: 'user-owner', ownerGroupId: null },
        scope,
        caches: createReminderEligibilityCaches(),
      }),
    ).resolves.toEqual(['user-owner']);
  });

  it('drops an owner whose account is deactivated, without asking for a context', async () => {
    const fake = store({ inactive: ['user-owner'] });
    const { loader, calls } = loaderFor({ 'user-owner': writerInScope('user-owner') });

    await expect(
      resolveReviewReminderRecipients({
        prisma: fake.prisma,
        loader,
        article: { ownerUserId: 'user-owner', ownerGroupId: null },
        scope,
        caches: createReminderEligibilityCaches(),
      }),
    ).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it('drops an owner whose permission was revoked for this OU or service', async () => {
    const fake = store({});
    const elsewhere = createTestAuthorizationContext({
      subjectId: 'user-owner',
      assignments: [
        createTestAssignment({
          permissionKeys: [permissionKeys.knowledgeArticleWrite],
          organizationalUnitId: 'ou-2',
          organizationalUnitPath: '/finance',
          serviceId: 'service-2',
        }),
      ],
    });
    const { loader } = loaderFor({ 'user-owner': elsewhere });

    await expect(
      resolveReviewReminderRecipients({
        prisma: fake.prisma,
        loader,
        article: { ownerUserId: 'user-owner', ownerGroupId: null },
        scope,
        caches: createReminderEligibilityCaches(),
      }),
    ).resolves.toEqual([]);
  });

  it('drops an owner who has an account but no resolvable context', async () => {
    const fake = store({});
    const { loader } = loaderFor({});

    await expect(
      resolveReviewReminderRecipients({
        prisma: fake.prisma,
        loader,
        article: { ownerUserId: 'user-owner', ownerGroupId: null },
        scope,
        caches: createReminderEligibilityCaches(),
      }),
    ).resolves.toEqual([]);
  });

  it('keeps a SuperAdmin owner', async () => {
    const fake = store({});
    const { loader } = loaderFor({
      'user-owner': createTestAuthorizationContext({ subjectId: 'user-owner', isSuperAdmin: true }),
    });

    await expect(
      resolveReviewReminderRecipients({
        prisma: fake.prisma,
        loader,
        article: { ownerUserId: 'user-owner', ownerGroupId: null },
        scope,
        caches: createReminderEligibilityCaches(),
      }),
    ).resolves.toEqual(['user-owner']);
  });

  it('filters the owner group and reads its membership once for several articles', async () => {
    const fake = store({
      inactive: ['user-inactive'],
      members: { 'group-1': ['user-b', 'user-inactive', 'user-a', 'user-outsider'] },
    });
    const { loader, calls } = loaderFor({
      'user-a': writerInScope('user-a'),
      'user-b': writerInScope('user-b'),
      'user-inactive': writerInScope('user-inactive'),
      'user-outsider': createTestAuthorizationContext({
        subjectId: 'user-outsider',
        assignments: [],
      }),
    });
    const caches = createReminderEligibilityCaches();
    const article = { ownerUserId: null, ownerGroupId: 'group-1' };

    await expect(
      resolveReviewReminderRecipients({ prisma: fake.prisma, loader, article, scope, caches }),
    ).resolves.toEqual(['user-a', 'user-b']);

    // The second article of the same group reuses the membership and every context it already resolved.
    await expect(
      resolveReviewReminderRecipients({ prisma: fake.prisma, loader, article, scope, caches }),
    ).resolves.toEqual(['user-a', 'user-b']);
    expect(fake.counters.memberships).toBe(1);
    // The deactivated account is dropped on the account check, so its context is never even asked for.
    expect(calls).toEqual(['user-a', 'user-b', 'user-outsider']);
  });

  it('returns nothing when the article has neither an owner nor an owner group', async () => {
    const fake = store({});
    const { loader, calls } = loaderFor({});

    await expect(
      resolveReviewReminderRecipients({
        prisma: fake.prisma,
        loader,
        article: { ownerUserId: null, ownerGroupId: null },
        scope,
        caches: createReminderEligibilityCaches(),
      }),
    ).resolves.toEqual([]);
    expect(calls).toEqual([]);
    expect(fake.counters.users).toBe(0);
  });
});
