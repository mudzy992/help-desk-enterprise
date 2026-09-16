import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assignUserRole } from './assign-user-role';
import { createUser } from './create-user';
import { deleteUser } from './delete-user';
import { listUserRoles } from './list-user-roles';
import { listUsersSummary } from './list-users-summary';
import { mapUsersError } from './map-users-error';
import { removeUserRole } from './remove-user-role';
import { updateUser } from './update-user';
import type {
  AssignUserRoleInput,
  CreateUserInput,
  RemoveUserRoleInput,
  UpdateUserInput,
  UserRoleResponse,
  UserSummaryResponse,
} from './users.types';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listSummary(): Promise<readonly UserSummaryResponse[]> {
    return this.execute(() => listUsersSummary(this.prisma));
  }

  create(input: CreateUserInput): Promise<UserSummaryResponse> {
    return this.execute(() => createUser(this.prisma, input));
  }

  update(input: UpdateUserInput): Promise<UserSummaryResponse> {
    return this.execute(() => updateUser(this.prisma, input));
  }

  delete(userId: string): Promise<void> {
    return this.execute(() => deleteUser(this.prisma, userId));
  }

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
