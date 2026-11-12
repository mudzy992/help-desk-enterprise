export type IntegrationJobErrorTranslationKey =
  | "integrationQueue.noError"
  | "integrationQueue.errorCodes.TEAMS_DELIVERY_SKIPPED"
  | "integrationQueue.errorCodes.TEAMS_DELIVERY_PERMANENT_FAILURE"
  | "integrationQueue.errorCodes.TEAMS_CONVERSATION_GONE"
  | "integrationQueue.errorCodes.EDGE_EVENT_NO_SUBSCRIBERS"
  | "integrationQueue.errorCodes.PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN"
  | "integrationQueue.errorCodes.PROVIDER_DELIVERY_OUTCOME_UNKNOWN"
  | "integrationQueue.errorCodes.INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED"
  | "integrationQueue.errorCodes.INTEGRATION_JOB_FAILED";

export function mapIntegrationJobErrorCode(code: string | null): IntegrationJobErrorTranslationKey {
  switch (code) {
    case null:
      return "integrationQueue.noError";
    case "TEAMS_DELIVERY_PERMANENT_FAILURE":
      return "integrationQueue.errorCodes.TEAMS_DELIVERY_PERMANENT_FAILURE";
    case "TEAMS_DELIVERY_SKIPPED":
      return "integrationQueue.errorCodes.TEAMS_DELIVERY_SKIPPED";
    case "TEAMS_CONVERSATION_GONE":
      return "integrationQueue.errorCodes.TEAMS_CONVERSATION_GONE";
    case "EDGE_EVENT_NO_SUBSCRIBERS":
      return "integrationQueue.errorCodes.EDGE_EVENT_NO_SUBSCRIBERS";
    case "PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN":
      return "integrationQueue.errorCodes.PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN";
    case "PROVIDER_DELIVERY_OUTCOME_UNKNOWN":
      return "integrationQueue.errorCodes.PROVIDER_DELIVERY_OUTCOME_UNKNOWN";
    case "INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED":
      return "integrationQueue.errorCodes.INTEGRATION_JOB_PAYLOAD_LIMIT_EXCEEDED";
    case "INTEGRATION_JOB_FAILED":
    default:
      // Unknown future/server values remain generic; never render raw text.
      return "integrationQueue.errorCodes.INTEGRATION_JOB_FAILED";
  }
}
