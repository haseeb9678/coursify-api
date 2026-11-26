import {
    Args,
    ID,
    Mutation,
    Query,
    Resolver,
} from '@nestjs/graphql';
import {
    ParseUUIDPipe,
    UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { GqlAuthGuard } from '../../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { PaginationInput } from '../../../common/pagination/pagination.input.js';
import {
    createMutationResponse,
    MutationResponse,
} from '../../../common/responses/mutation.response.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type.js';
import { User } from '../../users/entities/user.entity.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminCreateUserInput } from './dto/admin-create-user.input.js';
import { AdminRevokeSessionsInput } from './dto/admin-revoke-sessions.input.js';
import { AdminUpdateUserInput } from './dto/admin-update-user.input.js';
import { AdminUpdateUserRoleInput } from './dto/admin-update-user-role.input.js';
import { AdminUpdateUserStatusInput } from './dto/admin-update-user-status.input.js';
import { AdminUsersFilterInput } from './dto/admin-users-filter.input.js';
import { AdminUsersSortInput } from './dto/admin-users-sort.input.js';
import { AdminUserMutationResponse } from './entities/admin-user-mutation-response.entity.js';
import { AdminUserSession } from './entities/admin-user-session.entity.js';
import { AdminUserStats } from './entities/admin-user-stats.entity.js';
import { AdminUsersResponse } from './entities/admin-users-response.entity.js';

@Resolver(() => User)
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminUsersResolver {
    constructor(
        private readonly adminUsersService: AdminUsersService,
    ) {}

    @Query(() => AdminUsersResponse, {
        name: 'adminUsers',
        description: 'List users with admin-only filtering and pagination',
    })
    adminUsers(
        @Args('pagination', {
            type: () => PaginationInput,
            defaultValue: { page: 1, limit: 10 },
        })
        pagination: PaginationInput,
        @Args('filter', {
            type: () => AdminUsersFilterInput,
            nullable: true,
        })
        filter?: AdminUsersFilterInput,
        @Args('sort', {
            type: () => AdminUsersSortInput,
            nullable: true,
        })
        sort?: AdminUsersSortInput,
    ) {
        return this.adminUsersService.findUsers(
            pagination,
            filter,
            sort,
        );
    }

    @Query(() => User, {
        name: 'adminUser',
        description: 'Get an admin-safe user profile',
    })
    adminUser(
        @Args('userId', { type: () => ID }, ParseUUIDPipe)
        userId: string,
    ) {
        return this.adminUsersService.findUser(userId);
    }

    @Query(() => AdminUserStats, {
        name: 'adminUserStats',
        description: 'Get aggregate user-management statistics',
    })
    adminUserStats() {
        return this.adminUsersService.getUserStats();
    }

    @Query(() => [AdminUserSession], {
        name: 'adminUserSessions',
        description: 'List active sessions for a user, bounded by pagination',
    })
    adminUserSessions(
        @Args('userId', { type: () => ID }, ParseUUIDPipe)
        userId: string,
        @Args('pagination', {
            type: () => PaginationInput,
            defaultValue: { page: 1, limit: 50 },
        })
        pagination: PaginationInput,
    ) {
        return this.adminUsersService.findUserSessions(
            userId,
            pagination,
        );
    }

    @Mutation(() => AdminUserMutationResponse, {
        name: 'adminCreateUser',
    })
    async adminCreateUser(
        @Args('input') input: AdminCreateUserInput,
        @CurrentUser() actor: AuthenticatedUser,
    ): Promise<AdminUserMutationResponse> {
        const user = await this.adminUsersService.createUser(
            input,
            actor,
        );

        return {
            ...createMutationResponse('User created successfully'),
            user,
        };
    }

    @Mutation(() => AdminUserMutationResponse, {
        name: 'adminUpdateUser',
    })
    async adminUpdateUser(
        @Args('input') input: AdminUpdateUserInput,
        @CurrentUser() actor: AuthenticatedUser,
    ): Promise<AdminUserMutationResponse> {
        const user = await this.adminUsersService.updateUser(
            input,
            actor,
        );

        return {
            ...createMutationResponse('User updated successfully'),
            user,
        };
    }

    @Mutation(() => AdminUserMutationResponse, {
        name: 'adminUpdateUserStatus',
    })
    async adminUpdateUserStatus(
        @Args('input') input: AdminUpdateUserStatusInput,
        @CurrentUser() actor: AuthenticatedUser,
    ): Promise<AdminUserMutationResponse> {
        const user =
            await this.adminUsersService.updateUserStatus(
                input,
                actor,
            );

        return {
            ...createMutationResponse(
                'User status updated successfully',
            ),
            user,
        };
    }

    @Mutation(() => AdminUserMutationResponse, {
        name: 'adminUpdateUserRole',
    })
    async adminUpdateUserRole(
        @Args('input') input: AdminUpdateUserRoleInput,
        @CurrentUser() actor: AuthenticatedUser,
    ): Promise<AdminUserMutationResponse> {
        const user = await this.adminUsersService.updateUserRole(
            input,
            actor,
        );

        return {
            ...createMutationResponse(
                'User role updated successfully',
            ),
            user,
        };
    }

    @Mutation(() => MutationResponse, {
        name: 'adminDeleteUser',
        description:
            'Unavailable until an archival and audit workflow is implemented',
    })
    adminDeleteUser(
        @Args('userId', { type: () => ID }, ParseUUIDPipe)
        _userId: string,
    ): Promise<never> {
        return this.adminUsersService.deleteUser();
    }

    @Mutation(() => MutationResponse, {
        name: 'adminRevokeUserSessions',
    })
    adminRevokeUserSessions(
        @Args('input') input: AdminRevokeSessionsInput,
        @CurrentUser() actor: AuthenticatedUser,
    ) {
        return this.adminUsersService.revokeUserSessions(
            input,
            actor,
        );
    }
}
