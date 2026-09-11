import type { SafeLoggingFieldKey } from './safe-logging.constants';

export type TicketSafeLoggingConfiguration = {
  readonly enabled: boolean;
  readonly levels: readonly string[];
  readonly redactFields: readonly SafeLoggingFieldKey[];
};

export type SafeTicketLogInput = {
  readonly ticketId?: string;
  readonly actorUserId?: string;
  readonly action?: string;
  readonly classification?: string;
  readonly isConfidential?: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly body?: string;
  readonly formData?: unknown;
  readonly [key: string]: unknown;
};
