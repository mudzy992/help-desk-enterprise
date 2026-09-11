import type { Prisma } from '../../../generated/prisma/client';

export function toSavedViewJsonValue(value: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
