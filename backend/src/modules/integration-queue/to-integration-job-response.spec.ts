import {
  IntegrationJobStatus,
  IntegrationJobType,
} from '../../generated/prisma/enums';
import { toIntegrationJobResponse } from './to-integration-job-response';

const timestamps = {
  nextRetryAt: new Date('2026-11-07T12:00:00.000Z'),
  createdAt: new Date('2026-11-07T11:00:00.000Z'),
  updatedAt: new Date('2026-11-07T11:30:00.000Z'),
};

describe('toIntegrationJobResponse', () => {
  it('omits payload and raw error text from the admin response', () => {
    const job = {
      id: 'job-email-1',
      type: IntegrationJobType.EMAIL,
      status: IntegrationJobStatus.DLQ,
      payload: {
        toAddress: 'private@example.test',
        subject: 'Private subject',
        text: 'Private body',
        html: '<p>Private HTML</p>',
        headers: { 'x-private': 'private-header' },
        data: { address: 'private@example.test' },
      },
      lastError:
        'SMTP rejected private@example.test: private provider response',
      attempts: 4,
      ...timestamps,
    };
    const response = toIntegrationJobResponse(job);

    expect(response).toEqual({
      id: 'job-email-1',
      type: IntegrationJobType.EMAIL,
      status: IntegrationJobStatus.DLQ,
      lastErrorCode: 'INTEGRATION_JOB_FAILED',
      attempts: 4,
      nextRetryAt: timestamps.nextRetryAt.toISOString(),
      createdAt: timestamps.createdAt.toISOString(),
      updatedAt: timestamps.updatedAt.toISOString(),
    });
    expect(response).not.toHaveProperty('payload');
    expect(response).not.toHaveProperty('lastError');
    expect(JSON.stringify(response)).not.toContain('private@example.test');
    expect(JSON.stringify(response)).not.toContain('Private body');
    expect(JSON.stringify(response)).not.toContain('private provider response');
  });

  it('preserves only the known Edge event error code for Edge event jobs', () => {
    const response = toIntegrationJobResponse({
      id: 'job-edge-1',
      type: IntegrationJobType.EDGE_EVENT,
      status: IntegrationJobStatus.FAILED,
      lastError: 'EDGE_EVENT_NO_SUBSCRIBERS',
      attempts: 1,
      ...timestamps,
    });

    expect(response.lastErrorCode).toBe('EDGE_EVENT_NO_SUBSCRIBERS');
  });

  it('does not classify an identical arbitrary message on another job type as a stable Edge code', () => {
    const response = toIntegrationJobResponse({
      id: 'job-teams-1',
      type: IntegrationJobType.TEAMS,
      status: IntegrationJobStatus.FAILED,
      lastError: 'EDGE_EVENT_NO_SUBSCRIBERS',
      attempts: 1,
      ...timestamps,
    });

    expect(response.lastErrorCode).toBe('INTEGRATION_JOB_FAILED');
  });

  it('exposes the safe unknown-outcome code without a raw provider error', () => {
    const response = toIntegrationJobResponse({
      id: 'job-stale', type: IntegrationJobType.EMAIL, status: IntegrationJobStatus.DLQ,
      lastError: 'PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN', attempts: 1, ...timestamps,
    });
    expect(response.lastErrorCode).toBe('PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN');
    expect(toIntegrationJobResponse({
      id: 'job-provider', type: IntegrationJobType.TEAMS, status: IntegrationJobStatus.DLQ,
      lastError: 'PROVIDER_DELIVERY_OUTCOME_UNKNOWN', attempts: 1, ...timestamps,
    }).lastErrorCode).toBe('PROVIDER_DELIVERY_OUTCOME_UNKNOWN');
  });

  it('exposes the safe payload limit code', () => {
    const response = toIntegrationJobResponse({
      id: 'job-large', type: IntegrationJobType.EMAIL, status: IntegrationJobStatus.DLQ,
      lastError: 'INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED', attempts: 1, ...timestamps,
    });
    expect(response.lastErrorCode).toBe('INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED');
  });

  it('returns null error code when there is no stored error', () => {
    const response = toIntegrationJobResponse({
      id: 'job-pending-1',
      type: IntegrationJobType.EMAIL,
      status: IntegrationJobStatus.PENDING,
      lastError: null,
      attempts: 0,
      ...timestamps,
    });

    expect(response.lastErrorCode).toBeNull();
  });
});
