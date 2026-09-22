import { PATH_METADATA } from '@nestjs/common/constants';
import { GroupsController } from './groups.controller';
import { GroupsMineController } from './groups-mine.controller';
import { GroupsModule } from './groups.module';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

// GET /groups/:groupId matches any single segment, so the fixed-path
// /groups/mine controller must be registered ahead of GroupsController.
describe('GroupsModule controller order', () => {
  it('registers GroupsMineController before GroupsController', () => {
    const controllers = Reflect.getMetadata('controllers', GroupsModule) as unknown[];
    expect(controllers.indexOf(GroupsMineController)).toBeGreaterThanOrEqual(0);
    expect(controllers.indexOf(GroupsMineController)).toBeLessThan(
      controllers.indexOf(GroupsController),
    );
  });

  it('mounts at the literal path "mine" under the module prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, GroupsMineController)).toBe('groups/mine');
  });
});
