import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { Client } from 'pg';
import nodemailer from 'nodemailer';
import { ApiClient } from '../helpers/api-client';
import { readE2EEnvironment } from '../helpers/environment';

/** Sends one unique message to a disposable mailbox and verifies its ticket. */
test('an inbound mailbox message creates a correlated ticket', async () => {
  test.skip(process.env.E2E_VAL6_INBOUND !== '1', 'Requires a disposable Val 6 inbound mailbox fixture');
  test.setTimeout(240_000);
  const env = readE2EEnvironment();
  const host = process.env.E2E_VAL6_SMTP_HOST?.trim();
  const port = Number(process.env.E2E_VAL6_SMTP_PORT);
  const recipient = process.env.E2E_VAL6_INBOUND_ADDRESS?.trim();
  const username = process.env.E2E_VAL6_SMTP_USERNAME;
  const password = process.env.E2E_VAL6_SMTP_PASSWORD;
  const missing: string[] = [];
  if (!env.databaseUrl?.trim()) missing.push('E2E_DATABASE_URL (or DATABASE_URL secret)');
  if (!host) missing.push('E2E_VAL6_SMTP_HOST variable');
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push('E2E_VAL6_SMTP_PORT variable (integer 1–65535)');
  if (!recipient) missing.push('E2E_VAL6_INBOUND_ADDRESS variable');
  if (missing.length > 0 || !env.databaseUrl || !host || !recipient) {
    throw new Error(`Inbound fixture missing or invalid configuration: ${missing.join(', ')}`);
  }
  if (Boolean(username) !== Boolean(password)) throw new Error('Inbound SMTP authentication requires both username and password');
  const messageId = `<val6-${randomUUID()}@example.test>`;
  const subject = `Val 6 inbound E2E ${randomUUID()}`;
  const smtp = nodemailer.createTransport({
    host, port,
    secure: process.env.E2E_VAL6_SMTP_SECURE === 'true',
    ...(username && password ? { auth: { user: username, pass: password } } : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const db = new Client({ connectionString: env.databaseUrl });
  await db.connect();
  try {
    try {
      await smtp.sendMail({ from: env.userEmail, to: recipient, subject, text: 'Disposable Val 6 inbound test.', messageId });
    } catch {
      // Provider responses may contain credentials or addresses. Do not log them.
      throw new Error('Inbound E2E SMTP submission failed; check the disposable test fixture');
    }
    let ticketId: string | null = null;
    await expect.poll(async () => {
      const result = await db.query<{ status: string; createdTicketId: string | null }>(
        'SELECT status::text AS status, "createdTicketId" FROM "InboundEmail" WHERE "messageIdHeader" = $1 AND status = \'PROCESSED\' ORDER BY "createdAt" DESC LIMIT 1',
        [messageId],
      );
      ticketId = result.rows[0]?.createdTicketId ?? null;
      return ticketId !== null;
    }, { timeout: 180_000, message: 'No processed inbound message with a created ticket; verify the isolated mailbox worker fixture' }).toBe(true);
    const admin = new ApiClient();
    await admin.login(env.superAdminEmail, env.superAdminPassword);
    const ticket = await admin.requestJson<{ id: string; title: string }>(`/tickets/${ticketId}`);
    expect(ticket.title).toBe(subject);
  } finally {
    smtp.close();
    await db.end();
  }
});
