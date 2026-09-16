import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assignUserRole } from './assign-user-role';
import { listUserRoles } from './list-user-roles';
import { mapUsersError } from './map-users-error';
import { removeUserRole } from './remove-user-role';
import type {
  AssignUserRoleInput,
  RemoveUserRoleInput,
  UserRoleResponse,
} from './users.types';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles(userId: string): Promise<readonly UserRoleResponse[]> {
    return this.execute(() => listUserRoles(this.prisma, userId));
  }

  assignRole(input: AssignUserRoleInput): Promise<UserRoleResponse> {
    return this.execute(() => assignUserRole(this.prisma, input));
  }

  removeRole(input: RemoveUserRoleInput): Promise<void> {
    return this.execute(() => removeUserRole(this.prisma, input));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      mapUsersError(error);
    }
  }
}
