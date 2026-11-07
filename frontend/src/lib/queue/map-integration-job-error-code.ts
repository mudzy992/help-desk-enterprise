export type IntegrationJobErrorTranslationKey =
  | "integrationQueue.noError"
  | "integrationQueue.errorCodes.EDGE_EVENT_NO_SUBSCRIBERS"
  | "integrationQueue.errorCodes.INTEGRATION_JOB_FAILED";

export function mapIntegrationJobErrorCode(code: string | null): IntegrationJobErrorTranslationKey {
  switch (code) {
    case null:
      return "integrationQueue.noError";
    case "EDGE_EVENT_NO_SUBSCRIBERS":
      return "integrationQueue.errorCodes.EDGE_EVENT_NO_SUBSCRIBERS";
    case "INTEGRATION_JOB_FAILED":
    default:
      // Unknown future/server values remain generic; never render raw text.
      return "integrationQueue.errorCodes.INTEGRATION_JOB_FAILED";
  }
}
