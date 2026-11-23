import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import type { EmailChannelConfiguration } from '../../notifications/email/load-email-channel-configuration';
import type { MailTransport } from '../../notifications/email/mail-transport';
import { deliverNotificationEmail } from '../../notifications/email/deliver-notification-email';
import { NotificationEmailOutcomeUnknownError } from '../../notifications/email/notification-email-delivery-errors';
import { emailDeliveryStatuses } from '../../notifications/email/email-template.constants';

/**
 * W7.99 (`BA-reports-09`): the scheduled report is sent with `deliverNotificationEmail`, whose ledger row is
 * claimed before SMTP and marked SENT after. SMTP accepting the message and the process dying before that mark is
 * the one window neither side can close — so the promise is **at-least-once, never a blind second send**. This
 * file proves it on a real PostgreSQL with the reports dedupe key shape (`report:<slotKey>`):
 *
 * 1. the crash leaves a CLAIMED row (the acceptance evidence is lost, the send is not repeated),
 * 2. after the stale window the claim becomes UNKNOWN and still nothing is resent,
 * 3. a claim that is not yet stale answers DUPLICATE (no send), and
 * 4. without a crash the row carries the SMTP acceptance evidence.
 */
const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('report schedule delivery crash window (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient | undefined;
  let userId = '';
  const suffix = `${process.pid}-${Date.now()}`;
  const toAddress = `it-report-crash-${suffix}@example.test`;
  const dedupeKey = `report:sch-${suffix}:2026-04-26T22:00:00.000Z`;

  function database(): PrismaClient {
    if (prisma === undefined) throw new Error('integration Prisma client was not initialized');
    return prisma;
  }

  const configuration = { smtp: { fromAddress: 'reports@example.test' } } as unknown as EmailChannelConfiguration;

  function acceptingTransport() {
    const send = jest.fn(async () => ({
      acceptedRecipientCount: 1,
      rejectedRecipientCount: 0,
      messageId: `<report-${suffix}@example.test>`,
      responseCode: 250,
      failureKind: null,
    }));
    return { send, transport: { send } as unknown as MailTransport };
  }

  /** The process died between SMTP acceptance and the SENT mark: the mark itself fails. */
  function crashingPrisma(): PrismaClient {
    const real = database();
    return new Proxy(real, {
      get(target, property, receiver) {
        if (property !== 'notificationEmailDelivery') return Reflect.get(target, property, receiver);
        const delegate = target.notificationEmailDelivery;
        return new Proxy(delegate, {
          get(delegateTarget, delegateProperty, delegateReceiver) {
            if (delegateProperty !== 'updateMany') {
              return Reflect.get(delegateTarget, delegateProperty, delegateReceiver);
            }
            return async (args: { readonly data?: { readonly status?: string } }) => {
              if (args?.data?.status === emailDeliveryStatuses.sent) {
                throw new Error('connection lost before the SENT mark');
              }
              return delegate.updateMany(args as never);
            };
          },
        });
      },
    });
  }

  function input(dedupe: string = dedupeKey) {
    return {
      userId,
      toAddress,
      subject: 'Scheduled report',
      text: 'Crash window acceptance test',
      templateKey: 'report.scheduled',
      dedupeKey: dedupe,
    };
  }

  async function row() {
    return database().notificationEmailDelivery.findUniqueOrThrow({
      where: { userId_dedupeKey: { userId, dedupeKey } },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const user = await database().user.create({
      data: { email: `it-report-crash-${suffix}@example.test`, displayName: `IT report crash ${suffix}` },
      select: { id: true },
    });
    userId = user.id;
  });

  afterEach(async () => {
    await database().notificationEmailDelivery.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    const db = prisma;
    if (db === undefined) return;
    await db.notificationEmailDelivery.deleteMany({ where: { userId } });
    if (userId !== '') await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it('leaves a CLAIMED row when the SENT mark is lost, and never sends that report twice', async () => {
    const { send, transport } = acceptingTransport();

    await expect(
      deliverNotificationEmail(crashingPrisma(), transport, configuration, input()),
    ).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);
    expect(send).toHaveBeenCalledTimes(1);
    // SMTP accepted the message; only our bookkeeping is missing.
    expect(await row()).toMatchObject({ status: emailDeliveryStatuses.claimed, providerAcceptedAt: null });

    // Move the claim past the stale window the way 10 minutes of downtime would.
    await database().$executeRawUnsafe(
      'UPDATE "NotificationEmailDelivery" SET "updatedAt" = $1 WHERE "userId" = $2 AND "dedupeKey" = $3',
      new Date(Date.now() - 11 * 60_000),
      userId,
      dedupeKey,
    );

    // The retried sweep (stale-run takeover, same slot key) must not resend: the outcome is unknown, not "not sent".
    await expect(
      deliverNotificationEmail(database(), transport, configuration, input()),
    ).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({
      status: emailDeliveryStatuses.unknown,
      lastErrorCode: 'stale_claim',
      nextRetryAt: null,
    });

    // Even a third pass stays blocked: an operator decides, not the scheduler.
    await expect(
      deliverNotificationEmail(database(), transport, configuration, input()),
    ).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('answers DUPLICATE for a claim that is still fresh instead of sending again', async () => {
    const { send, transport } = acceptingTransport();
    await expect(
      deliverNotificationEmail(crashingPrisma(), transport, configuration, input()),
    ).rejects.toBeInstanceOf(NotificationEmailOutcomeUnknownError);
    expect(send).toHaveBeenCalledTimes(1);

    // Fresh claim: the previous attempt may still be inside SMTP, so this one neither sends nor escalates.
    await expect(deliverNotificationEmail(database(), transport, configuration, input())).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ status: emailDeliveryStatuses.claimed });
  });

  it('records the SMTP acceptance evidence when nothing crashes', async () => {
    const { send, transport } = acceptingTransport();

    await deliverNotificationEmail(database(), transport, configuration, input());

    expect(send).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({
      status: emailDeliveryStatuses.sent,
      attempts: 1,
      providerMessageId: `<report-${suffix}@example.test>`,
      providerResponseCode: 250,
      providerAcceptedAt: expect.any(Date),
    });
    // A retried sweep for the same slot is a no-op, not a second e-mail.
    await deliverNotificationEmail(database(), transport, configuration, input());
    expect(send).toHaveBeenCalledTimes(1);
  });
});
