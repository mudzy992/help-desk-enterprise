import { Prisma } from '../../generated/prisma/client';

export function toTicketFormDataInput(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}
