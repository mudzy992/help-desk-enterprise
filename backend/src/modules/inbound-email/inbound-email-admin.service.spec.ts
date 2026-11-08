import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { readReplyTokenSecret } from '../notifications/email/reply-token';
import type { SettingsService } from '../settings/settings.service';
import {
  inboundConfigurationProblems,
  inboundMailboxKey,
  loadInboundEmailConfiguration,
  type InboundEmailConfiguration,
} from './inbound-email-configuration';
import { createInboundMailbox } from './mailbox/create-inbound-mailbox';
import {
  inboundEmailAdminConnectionFailureCode,
  inboundEmailAdminRedactedValue,
  InboundEmailAdminService,
} from './inbound-email-admin.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../notifications/email/load-email-channel-configuration', () => ({
  loadEmailChannelConfiguration: jest.fn(),
}));
jest.mock('../notifications/email/reply-token', () => ({
  readReplyTokenSecret: jest.fn(),
}));
jest.mock('./inbound-email-configuration', () => ({
  inboundConfigurationProblems: jest.fn(),
  inboundMailboxKey: jest.fn(),
  loadInboundEmailConfiguration: jest.fn(),
}));
jest.mock('./mailbox/create-inbound-mailbox', () => ({
  createInboundMailbox: jest.fn(),
}));

const loadEmailConfigurationMock = jest.mocked(loadEmailChannelConfiguration);
const readReplyTokenSecretMock = jest.mocked(readReplyTokenSecret);
const inboundConfigurationProblemsMock = jest.mocked(
  inboundConfigurationProblems,
);
const inboundMailboxKeyMock = jest.mocked(inboundMailboxKey);
const loadInboundEmailConfigurationMock = jest.mocked(
  loadInboundEmailConfiguration,
);
const createInboundMailboxMock = jest.mocked(createInboundMailbox);

const configuration = {
  enabled: true,
  provider: 'imap',
  address: 'support@example.test',
  pollSeconds: 60,
  graph: { tenantId: '', clientId: '', clientSecret: '' },
  imap: {
    host: 'imap.example.test',
    port: 993,
    tls: true,
    username: 'support',
    password: 'secret',
    authMethod: 'password',
  },
  processedFolder: 'Processed',
  rejectedFolder: 'Rejected',
  requireAuthPass: false,
  trustedAuthservId: '',
  createTickets: false,
  defaultServiceId: '',
  rawRetentionDays: 30,
  metadataRetentionDays: 90,
  maxPerSenderPerHour: 10,
  maxMessagesPerRun: 50,
} satisfies InboundEmailConfiguration;

const findState = jest.fn();
const groupByStatus = jest.fn();
const findRecent = jest.fn();
const findTickets = jest.fn();
const prisma = {
  inboundMailboxState: { findUnique: findState },
  inboundEmail: { groupBy: groupByStatus, findMany: findRecent },
  ticket: { findMany: findTickets },
} as unknown as PrismaService;
const settings = {} as SettingsService;

function makeService(): InboundEmailAdminService {
  return new InboundEmailAdminService(prisma, settings);
}

describe('InboundEmailAdminService redaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadInboundEmailConfigurationMock.mockResolvedValue(configuration);
    loadEmailConfigurationMock.mockResolvedValue({
      presentation: { replyMode: 'shared_mailbox' },
    } as never);
    inboundConfigurationProblemsMock.mockReturnValue([]);
    inboundMailboxKeyMock.mockReturnValue('imap:support@example.test');
    readReplyTokenSecretMock.mockReturnValue(null);
    findState.mockResolvedValue({
      lastRunAt: new Date('2026-10-29T12:00:00.000Z'),
      lastSuccessAt: new Date('2026-10-29T11:00:00.000Z'),
      lastError:
        'provider login failed for private.sender@example.test: secret-token-123',
      lastErrorAt: new Date('2026-10-29T12:00:00.000Z'),
      consecutiveFails: 2,
    });
    groupByStatus.mockResolvedValue([
      { status: 'PROCESSED', _count: { _all: 4 } },
      { status: 'REJECTED', _count: { _all: 1 } },
      { status: 'IGNORED', _count: { _all: 2 } },
      { status: 'FAILED', _count: { _all: 1 } },
    ]);
    findRecent.mockResolvedValue([
      {
        id: 'inbound-1',
        status: 'FAILED',
        reason: 'AUTHENTICATION_FAILED',
        fromAddress: 'private.sender@example.test',
        subject: 'Confidential case 8492',
        ticketId: null,
        createdAt: new Date('2026-10-29T12:00:00.000Z'),
      },
    ]);
    findTickets.mockResolvedValue([]);
  });

  it('redacts sender, subject, and stored error details from mailbox status', async () => {
    const response = await makeService().getStatus(
      new Date('2026-10-29T13:00:00.000Z'),
    );

    expect(response.state?.lastError).toBe(inboundEmailAdminRedactedValue);
    expect(response.recent).toEqual([
      {
        id: 'inbound-1',
        status: 'FAILED',
        reason: 'AUTHENTICATION_FAILED',
        fromAddress: inboundEmailAdminRedactedValue,
        subject: inboundEmailAdminRedactedValue,
        ticketId: null,
        ticketNumber: null,
        createdAt: '2026-10-29T12:00:00.000Z',
      },
    ]);

    const recentQuery = findRecent.mock.calls[0]?.[0] as {
      select: Record<string, unknown>;
    };
    expect(recentQuery.select).not.toHaveProperty('fromAddress');
    expect(recentQuery.select).not.toHaveProperty('subject');
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('private.sender@example.test');
    expect(serialized).not.toContain('Confidential case 8492');
    expect(serialized).not.toContain('secret-token-123');
    expect(serialized).not.toContain('provider login failed');
  });

  it('returns only a stable failure code for connector errors', async () => {
    const connectorError =
      'IMAP AUTH failed for private.sender@example.test with secret-token-456';
    const session = {
      list: jest.fn().mockRejectedValue(new Error(connectorError)),
      close: jest.fn().mockResolvedValue(undefined),
    };
    createInboundMailboxMock.mockReturnValue({
      open: jest.fn().mockResolvedValue(session),
    } as never);

    const response = await makeService().testConnection();

    expect(response).toEqual({
      ok: false,
      errorCode: inboundEmailAdminConnectionFailureCode,
      problems: [],
    });
    expect(JSON.stringify(response)).not.toContain(connectorError);
    expect(JSON.stringify(response)).not.toContain(
      'private.sender@example.test',
    );
    expect(JSON.stringify(response)).not.toContain('secret-token-456');
    expect(session.close).toHaveBeenCalledTimes(1);
  });
});
