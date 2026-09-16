import { PrismaService } from '../../common/prisma/prisma.service';
import { groupsConstants } from './groups.constants';
import { GroupsError } from './groups.error';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function generateGroupKey(
  prisma: PrismaService,
  name: string,
): Promise<string> {
  const base = slugifyGroupName(name);
  if (base.length === 0) {
    throw new GroupsError('INVALID_NAME');
  }
  let candidate = base;
  let suffix = 2;
  while (await prisma.group.findUnique({ where: { key: candidate } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
    if (candidate.length > groupsConstants.maximumKeyLength) {
      throw new GroupsError('DUPLICATE_KEY');
    }
  }
  return candidate;
}

function slugifyGroupName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, groupsConstants.maximumKeyLength);
  if (normalized.length === 0 || !slugPattern.test(normalized)) {
    return normalized.length > 0 ? normalized : '';
  }
  return normalized;
}
