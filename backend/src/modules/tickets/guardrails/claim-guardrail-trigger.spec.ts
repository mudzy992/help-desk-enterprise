import { createInMemoryTicketsPrisma } from '../create-in-memory-tickets-prisma';
import { defaultTicketGuardrailsConfiguration } from './guardrails.constants';
import {
  automationFingerprint,
  claimGuardrailTrigger,
} from './claim-guardrail-trigger';
import { descriptionSimilarity } from './description-similarity';
import { parseTicketGuardrailsConfiguration } from './parse-ticket-guardrails-configuration';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('guardrail trigger claims', () => {
  it('scores near-identical descriptions above the default threshold', () => {
    expect(
      descriptionSimilarity(
        'Cannot connect from the office',
        'Cannot connect from the office.',
      ),
    ).toBeGreaterThanOrEqual(
      defaultTicketGuardrailsConfiguration.similarityThreshold,
    );
  });

  it('rejects a repeated fingerprint and then a loop after the repeat limit', async () => {
    const memory = createInMemoryTicketsPrisma();
    const configuration = {
      ...defaultTicketGuardrailsConfiguration,
      duplicateWindowMinutes: 10,
      maxRepeatsPerSubject: 3,
    };
    const first = await claimGuardrailTrigger({
      prisma: memory.prisma as never,
      configuration,
      claim: {
        kind: 'automation',
        subjectKey: 'ticket-1',
        fingerprint: automationFingerprint('remind', 't1'),
      },
    });
    const duplicate = await claimGuardrailTrigger({
      prisma: memory.prisma as never,
      configuration,
      claim: {
        kind: 'automation',
        subjectKey: 'ticket-1',
        fingerprint: automationFingerprint('remind', 't1'),
      },
    });
    expect(first).toEqual({ allowed: true, reason: 'claimed' });
    expect(duplicate).toEqual({ allowed: false, reason: 'duplicate' });
    await claimGuardrailTrigger({
      prisma: memory.prisma as never,
      configuration,
      claim: {
        kind: 'automation',
        subjectKey: 'ticket-1',
        fingerprint: automationFingerprint('remind', 't2'),
      },
    });
    await claimGuardrailTrigger({
      prisma: memory.prisma as never,
      configuration,
      claim: {
        kind: 'automation',
        subjectKey: 'ticket-1',
        fingerprint: automationFingerprint('remind', 't3'),
      },
    });
    const looped = await claimGuardrailTrigger({
      prisma: memory.prisma as never,
      configuration,
      claim: {
        kind: 'automation',
        subjectKey: 'ticket-1',
        fingerprint: automationFingerprint('remind', 't4'),
      },
    });
    expect(looped).toEqual({ allowed: false, reason: 'loop' });
  });

  it('allows only one concurrent claim for the same trigger', async () => {
    const memory = createInMemoryTicketsPrisma();
    const configuration = { ...defaultTicketGuardrailsConfiguration };
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        claimGuardrailTrigger({
          prisma: memory.prisma as never,
          configuration,
          claim: {
            kind: 'event',
            subjectKey: 'ticket-concurrent',
            fingerprint: 'waiting_for_user_reminder:same',
          },
        }),
      ),
    );
    expect(results.filter((item) => item.allowed)).toHaveLength(1);
    expect(results.filter((item) => item.reason === 'duplicate')).toHaveLength(2);
  });

  it('keeps bulk confirmation threshold when anti-loop is disabled', () => {
    const parsed = parseTicketGuardrailsConfiguration({
      enabled: false,
      duplicateWindowMinutes: 2,
      similarityThreshold: 0.9,
      mode: 'warn_only',
      confirmAboveRecipients: 5,
    });
    expect(parsed.enabled).toBe(false);
    expect(parsed.confirmAboveRecipients).toBe(5);
  });
});
