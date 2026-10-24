/* global process, setTimeout, clearTimeout */
import { Queue, QueueEvents, Worker } from 'bullmq';

const connection = { host: process.env.REDIS_HOST ?? '127.0.0.1', port: Number(process.env.REDIS_PORT ?? 6379), maxRetriesPerRequest: null };
const queueName = `worker-recovery-${process.pid}`;
const prefix = 'bull:w14:recovery';
const queue = new Queue(queueName, { connection, prefix });
const events = new QueueEvents(queueName, { connection, prefix });
await events.waitUntilReady();
let firstStarted;
const active = new Promise((resolve) => { firstStarted = resolve; });
const abandoned = new Worker(queueName, async () => { firstStarted(); await new Promise(() => undefined); }, {
  connection, prefix, lockDuration: 500, stalledInterval: 500, maxStalledCount: 1,
});
try {
  const job = await queue.add('unfinished-contract', {}, { attempts: 2, removeOnComplete: false });
  await active;
  await abandoned.close(true);
  const recovered = new Worker(queueName, async () => 'recovered', {
    connection, prefix, lockDuration: 500, stalledInterval: 500, maxStalledCount: 1,
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('stalled job was not recovered before deadline')), 15_000);
      events.on('completed', ({ jobId }) => { if (jobId === job.id) { clearTimeout(timer); resolve(); } });
    });
    const final = await queue.getJob(job.id);
    if (!final || await final.getState() !== 'completed' || final.attemptsStarted < 2) throw new Error('unfinished job did not complete through stalled recovery');
    process.stdout.write(`worker_recovery=pass attempts_started=${final.attemptsStarted}\n`);
  } finally { await recovered.close(); }
} finally {
  await abandoned.close(true).catch(() => undefined);
  await events.close();
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
}
