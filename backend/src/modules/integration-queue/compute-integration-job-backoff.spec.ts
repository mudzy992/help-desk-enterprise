import {
  computeIntegrationJobBackoffMilliseconds,
  resolveDeadLetterAttemptThreshold,
} from './compute-integration-job-backoff';

describe('computeIntegrationJobBackoffMilliseconds', () => {
  it('uses initial backoff on the first attempt and doubles until the cap', () => {
    expect(
      computeIntegrationJobBackoffMilliseconds({
        attempts: 1,
        initialBackoffSeconds: 60,
        maxBackoffSeconds: 3600,
      }),
    ).toBe(60_000);
    expect(
      computeIntegrationJobBackoffMilliseconds({
        attempts: 2,
        initialBackoffSeconds: 60,
        maxBackoffSeconds: 3600,
      }),
    ).toBe(120_000);
    expect(
      computeIntegrationJobBackoffMilliseconds({
        attempts: 10,
        initialBackoffSeconds: 60,
        maxBackoffSeconds: 3600,
      }),
    ).toBe(3_600_000);
  });

  it('uses the lower of maxAttempts and deadLetterAfterAttempts', () => {
    expect(
      resolveDeadLetterAttemptThreshold({
        maxAttempts: 10,
        deadLetterAfterAttempts: 3,
      }),
    ).toBe(3);
  });
});
