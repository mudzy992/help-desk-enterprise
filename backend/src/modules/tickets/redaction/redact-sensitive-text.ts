import { redactedContentPlaceholder } from './redaction.constants';
import { compileRedactionPatterns } from './detect-sensitive-content';
import type { TicketRedactionConfiguration } from './redaction.types';

export function redactSensitiveText(
  value: string,
  configuration: TicketRedactionConfiguration,
): string {
  if (!configuration.enabled || value.length === 0) {
    return value;
  }
  let redacted = value;
  for (const pattern of compileRedactionPatterns(configuration)) {
    pattern.expression.lastIndex = 0;
    redacted = redacted.replace(pattern.expression, redactedContentPlaceholder);
  }
  return redacted;
}
