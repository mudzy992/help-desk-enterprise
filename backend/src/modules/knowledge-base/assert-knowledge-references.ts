import { PrismaService } from '../../common/prisma/prisma.service';
import { KnowledgeBaseError } from './knowledge-base.error';

export async function assertKnowledgeServiceExists(
  prisma: PrismaService,
  serviceId: string,
): Promise<string> {
  const id = serviceId.trim();
  if (id.length === 0) {
    throw new KnowledgeBaseError('SERVICE_REQUIRED');
  }
  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true },
  });
  if (service === null) {
    throw new KnowledgeBaseError('SERVICE_NOT_FOUND');
  }
  return service.id;
}

export async function assertKnowledgeOrganizationalUnitExists(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<string> {
  const id = organizationalUnitId.trim();
  if (id.length === 0) {
    throw new KnowledgeBaseError('ORGANIZATIONAL_UNIT_REQUIRED');
  }
  const unit = await prisma.organizationalUnit.findUnique({
    where: { id },
    select: { id: true },
  });
  if (unit === null) {
    throw new KnowledgeBaseError('ORGANIZATIONAL_UNIT_NOT_FOUND');
  }
  return unit.id;
}

export async function assertKnowledgeUserExists(
  prisma: PrismaService,
  userId: string | null,
  missingCode: 'OWNER_USER_NOT_FOUND' | 'REVIEWER_NOT_FOUND',
): Promise<string | null> {
  if (userId === null) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (user === null) {
    throw new KnowledgeBaseError(missingCode);
  }
  return user.id;
}

export async function assertKnowledgeGroupExists(
  prisma: PrismaService,
  groupId: string | null,
): Promise<string | null> {
  if (groupId === null) {
    return null;
  }
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (group === null) {
    throw new KnowledgeBaseError('OWNER_GROUP_NOT_FOUND');
  }
  return group.id;
}
