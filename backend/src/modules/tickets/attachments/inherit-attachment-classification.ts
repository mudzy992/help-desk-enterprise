import type { DataClassification } from '../../../generated/prisma/enums';
import { dataClassificationRank } from './attachments.constants';
import { TicketsError } from '../tickets.error';

export function inheritAttachmentClassification(input: {
  readonly ticketClassification: DataClassification;
  readonly requestedClassification?: DataClassification;
}): DataClassification {
  if (input.requestedClassification === undefined) {
    return input.ticketClassification;
  }
  if (
    dataClassificationRank[input.requestedClassification] <
    dataClassificationRank[input.ticketClassification]
  ) {
    throw new TicketsError('CLASSIFICATION_DOWNGRADE');
  }
  return input.requestedClassification;
}

export function effectiveAttachmentClassification(input: {
  readonly ticketClassification: DataClassification;
  readonly storedClassification: DataClassification;
}): DataClassification {
  return dataClassificationRank[input.storedClassification] >=
    dataClassificationRank[input.ticketClassification]
    ? input.storedClassification
    : input.ticketClassification;
}
