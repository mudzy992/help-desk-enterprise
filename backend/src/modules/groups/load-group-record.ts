import { PrismaService } from '../../common/prisma/prisma.service';
import { GroupsError } from './groups.error';

const groupSelect = {
  id: true,
  name: true,
  key: true,
  organizationalUnitId: true,
  isFallback: true,
  createdAt: true,
  updatedAt: true,
  organizationalUnit: { select: { ouPath: true } },
  members: {
    select: {
      id: true,
      userId: true,
      createdAt: true,
      user: { select: { displayName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { members: true } },
} as const;

export type LoadedGroupRecord = {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly organizationalUnitId: string;
  readonly isFallback: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly organizationalUnit: { readonly ouPath: string };
  readonly members: readonly {
    readonly id: string;
    readonly userId: string;
    readonly createdAt: Date;
    readonly user: { readonly displayName: string; readonly email: string };
  }[];
  readonly _count: { readonly members: number };
};

export async function loadGroupRecord(
  prisma: PrismaService,
  groupId: string,
): Promise<LoadedGroupRecord> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: groupSelect,
  });
  if (group === null) {
    throw new GroupsError('NOT_FOUND');
  }
  return group;
}
