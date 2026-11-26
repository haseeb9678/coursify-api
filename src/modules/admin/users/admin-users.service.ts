import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import {
    UserRole,
    UserStatus,
} from '../../../generated/prisma/enums.js';

import { PaginationInput } from '../../../common/pagination/pagination.input.js';
import {
    createPaginationMeta,
    getPaginationWindow,
} from '../../../common/pagination/pagination.utils.js';
import { hashPassword } from '../../../common/utils/password.util.js';
import { mapPrismaError } from '../../../common/utils/prisma-error.util.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { SessionService } from '../../auth/services/session.service.js';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type.js';
import type { User } from '../../users/entities/user.entity.js';
import { AdminCreateUserInput } from './dto/admin-create-user.input.js';
import { AdminUpdateUserInput } from './dto/admin-update-user.input.js';
import { AdminUpdateUserRoleInput } from './dto/admin-update-user-role.input.js';
import { AdminUpdateUserStatusInput } from './dto/admin-update-user-status.input.js';
import { AdminUsersFilterInput } from './dto/admin-users-filter.input.js';
import { AdminUsersSortInput } from './dto/admin-users-sort.input.js';
import { AdminRevokeSessionsInput } from './dto/admin-revoke-sessions.input.js';
import {
    ADMIN_USER_SELECT,
    type AdminUserRecord,
} from './constants/admin-user-select.constants.js';
import { AdminUserSortField } from './enums/admin-user-sort-field.enum.js';
import { SortDirection } from '../../../common/enums/sort-direction.enum.js';

function assertDateRange(
    from: Date | undefined,
    to: Date | undefined,
    label: string,
): void {
    if (
        from !== undefined &&
        to !== undefined &&
        from.getTime() > to.getTime()
    ) {
        throw new BadRequestException(
            `${label} start must not be after its end`,
        );
    }
}

export function buildAdminUserWhere(
    filter: AdminUsersFilterInput = {},
): Prisma.UserWhereInput {
    assertDateRange(
        filter.createdFrom,
        filter.createdTo,
        'Created date range',
    );
    assertDateRange(
        filter.lastLoginFrom,
        filter.lastLoginTo,
        'Last login date range',
    );

    const search = filter.search?.trim();
    const where: Prisma.UserWhereInput = {};

    if (search) {
        where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
        ];
    }

    if (filter.role !== undefined) {
        where.role = filter.role;
    }

    if (filter.status !== undefined) {
        where.status = filter.status;
    }

    if (filter.isEmailVerified !== undefined) {
        where.isEmailVerified = filter.isEmailVerified;
    }

    if (
        filter.createdFrom !== undefined ||
        filter.createdTo !== undefined
    ) {
        where.createdAt = {
            ...(filter.createdFrom !== undefined
                ? { gte: filter.createdFrom }
                : {}),
            ...(filter.createdTo !== undefined
                ? { lte: filter.createdTo }
                : {}),
        };
    }

    if (
        filter.lastLoginFrom !== undefined ||
        filter.lastLoginTo !== undefined
    ) {
        where.lastLoginAt = {
            ...(filter.lastLoginFrom !== undefined
                ? { gte: filter.lastLoginFrom }
                : {}),
            ...(filter.lastLoginTo !== undefined
                ? { lte: filter.lastLoginTo }
                : {}),
        };
    }

    return where;
}

function getUserOrderBy(
    sort: AdminUsersSortInput = new AdminUsersSortInput(),
): Prisma.UserOrderByWithRelationInput[] {
    const direction =
        sort.direction === SortDirection.ASC ? 'asc' : 'desc';

    let orderBy: Prisma.UserOrderByWithRelationInput;

    switch (sort.field) {
        case AdminUserSortField.NAME:
            orderBy = { name: direction };
            break;
        case AdminUserSortField.EMAIL:
            orderBy = { email: direction };
            break;
        case AdminUserSortField.ROLE:
            orderBy = { role: direction };
            break;
        case AdminUserSortField.STATUS:
            orderBy = { status: direction };
            break;
        case AdminUserSortField.UPDATED_AT:
            orderBy = { updatedAt: direction };
            break;
        case AdminUserSortField.LAST_LOGIN_AT:
            orderBy = { lastLoginAt: direction };
            break;
        case AdminUserSortField.CREATED_AT:
        default:
            orderBy = { createdAt: direction };
    }

    return [orderBy, { id: 'asc' }];
}

function throwMappedPrismaError(error: unknown): never {
    const mappedError = mapPrismaError(error);

    if (mappedError) {
        throw mappedError;
    }

    throw error;
}

function findCount<
    T extends { _count: { _all: number } },
    K extends keyof T,
>(
    records: T[],
    property: K,
    value: T[K],
): number {
    const match = records.find((record) => record[property] === value);

    return match?._count._all ?? 0;
}

@Injectable()
export class AdminUsersService {
    private readonly logger = new Logger(AdminUsersService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly sessionService: SessionService,
    ) {}

    async findUsers(
        pagination: PaginationInput,
        filter?: AdminUsersFilterInput,
        sort?: AdminUsersSortInput,
    ) {
        const window = getPaginationWindow(pagination);
        const where = buildAdminUserWhere(filter);
        const [items, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                select: ADMIN_USER_SELECT,
                orderBy: getUserOrderBy(sort),
                skip: window.skip,
                take: window.take,
            }),
            this.prisma.user.count({ where }),
        ]);

        return {
            items,
            meta: createPaginationMeta(
                window.page,
                window.limit,
                total,
            ),
        };
    }

    async findUser(userId: string): Promise<AdminUserRecord> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: ADMIN_USER_SELECT,
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    async getUserStats() {
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);

        const [
            totalUsers,
            statusCounts,
            roleCounts,
            emailVerificationCounts,
            newUsersThisMonth,
        ] = await this.prisma.$transaction([
            this.prisma.user.count(),
            this.prisma.user.groupBy({
                by: ['status'],
                _count: { _all: true },
            }),
            this.prisma.user.groupBy({
                by: ['role'],
                _count: { _all: true },
            }),
            this.prisma.user.groupBy({
                by: ['isEmailVerified'],
                _count: { _all: true },
            }),
            this.prisma.user.count({
                where: { createdAt: { gte: monthStart } },
            }),
        ]);

        return {
            totalUsers,
            activeUsers: findCount(
                statusCounts,
                'status',
                UserStatus.ACTIVE,
            ),
            inactiveUsers: findCount(
                statusCounts,
                'status',
                UserStatus.INACTIVE,
            ),
            suspendedUsers: findCount(
                statusCounts,
                'status',
                UserStatus.SUSPENDED,
            ),
            verifiedUsers: findCount(
                emailVerificationCounts,
                'isEmailVerified',
                true,
            ),
            unverifiedUsers: findCount(
                emailVerificationCounts,
                'isEmailVerified',
                false,
            ),
            totalStudents: findCount(
                roleCounts,
                'role',
                UserRole.STUDENT,
            ),
            totalInstructors: findCount(
                roleCounts,
                'role',
                UserRole.INSTRUCTOR,
            ),
            totalAdmins: findCount(
                roleCounts,
                'role',
                UserRole.ADMIN,
            ),
            newUsersThisMonth,
        };
    }

    async createUser(
        input: AdminCreateUserInput,
        actor: AuthenticatedUser,
    ): Promise<User> {
        if (input.role === UserRole.ADMIN) {
            throw new ForbiddenException(
                'Creating administrator accounts is not permitted',
            );
        }

        const passwordHash = await hashPassword(input.password);

        try {
            const user = await this.prisma.user.create({
                data: {
                    name: input.name.trim(),
                    email: input.email.trim().toLowerCase(),
                    passwordHash,
                    role: input.role,
                    status: input.status,
                    isEmailVerified: false,
                },
                select: ADMIN_USER_SELECT,
            });

            this.logger.log(
                `Admin ${actor.userId} created user ${user.id}`,
            );
            return user;
        } catch (error: unknown) {
            throwMappedPrismaError(error);
        }
    }

    async updateUser(
        input: AdminUpdateUserInput,
        actor: AuthenticatedUser,
    ): Promise<User> {
        try {
            const updatedUser = await this.prisma.$transaction(
                async (transaction) => {
                    const existingUser =
                        await transaction.user.findUnique({
                            where: { id: input.id },
                            select: {
                                id: true,
                                email: true,
                            },
                        });

                    if (!existingUser) {
                        throw new NotFoundException('User not found');
                    }

                    if (
                        input.name === undefined &&
                        input.email === undefined &&
                        input.avatar === undefined
                    ) {
                        throw new BadRequestException(
                            'At least one user field must be provided',
                        );
                    }

                    return transaction.user.update({
                        where: { id: input.id },
                        data: {
                            ...(input.name !== undefined
                                ? { name: input.name.trim() }
                                : {}),
                            ...(input.email !== undefined
                                ? {
                                      email: input.email
                                          .trim()
                                          .toLowerCase(),
                                  }
                                : {}),
                            ...(input.avatar !== undefined
                                ? { avatar: input.avatar }
                                : {}),
                            ...(input.email !== undefined &&
                            input.email.trim().toLowerCase() !==
                                existingUser.email
                                ? { isEmailVerified: false }
                                : {}),
                        },
                        select: ADMIN_USER_SELECT,
                    });
                },
            );

            this.logger.log(
                `Admin ${actor.userId} updated user ${updatedUser.id}`,
            );
            return updatedUser;
        } catch (error: unknown) {
            throwMappedPrismaError(error);
        }
    }

    async updateUserStatus(
        input: AdminUpdateUserStatusInput,
        actor: AuthenticatedUser,
    ): Promise<User> {
        if (
            input.userId === actor.userId &&
            input.status !== UserStatus.ACTIVE
        ) {
            throw new ForbiddenException(
                'You cannot deactivate or suspend your own account',
            );
        }

        try {
            const updatedUser = await this.prisma.$transaction(
                async (transaction) => {
                    const targetUser =
                        await transaction.user.findUnique({
                            where: { id: input.userId },
                            select: {
                                id: true,
                                role: true,
                                status: true,
                            },
                        });

                    if (!targetUser) {
                        throw new NotFoundException('User not found');
                    }

                    if (targetUser.status === input.status) {
                        const unchangedUser =
                            await transaction.user.findUniqueOrThrow({
                                where: { id: targetUser.id },
                                select: ADMIN_USER_SELECT,
                            });

                        if (input.status !== UserStatus.ACTIVE) {
                            await this.sessionService.revokeAllSessions(
                                targetUser.id,
                                transaction,
                            );
                        }

                        return unchangedUser;
                    }

                    if (
                        targetUser.role === UserRole.ADMIN &&
                        targetUser.status === UserStatus.ACTIVE &&
                        input.status !== UserStatus.ACTIVE
                    ) {
                        await this.assertAnotherActiveAdminExists(
                            transaction,
                            targetUser.id,
                        );
                    }

                    const user = await transaction.user.update({
                        where: { id: targetUser.id },
                        data: { status: input.status },
                        select: ADMIN_USER_SELECT,
                    });

                    if (input.status !== UserStatus.ACTIVE) {
                        await this.sessionService.revokeAllSessions(
                            targetUser.id,
                            transaction,
                        );
                    }

                    return user;
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                },
            );

            this.logger.log(
                `Admin ${actor.userId} changed status for user ${updatedUser.id} to ${input.status}`,
            );
            return updatedUser;
        } catch (error: unknown) {
            this.throwAdminMutationError(error);
        }
    }

    async updateUserRole(
        input: AdminUpdateUserRoleInput,
        actor: AuthenticatedUser,
    ): Promise<User> {
        if (
            input.userId === actor.userId &&
            input.role !== UserRole.ADMIN
        ) {
            throw new ForbiddenException(
                'You cannot change your own role',
            );
        }

        if (input.role === UserRole.ADMIN) {
            throw new ForbiddenException(
                'Promoting users to administrator is not permitted',
            );
        }

        try {
            const updatedUser = await this.prisma.$transaction(
                async (transaction) => {
                    const targetUser =
                        await transaction.user.findUnique({
                            where: { id: input.userId },
                            select: {
                                id: true,
                                role: true,
                                status: true,
                            },
                        });

                    if (!targetUser) {
                        throw new NotFoundException('User not found');
                    }

                    if (targetUser.role === input.role) {
                        return transaction.user.findUniqueOrThrow({
                            where: { id: targetUser.id },
                            select: ADMIN_USER_SELECT,
                        });
                    }

                    if (
                        targetUser.role === UserRole.ADMIN &&
                        targetUser.status === UserStatus.ACTIVE
                    ) {
                        await this.assertAnotherActiveAdminExists(
                            transaction,
                            targetUser.id,
                        );
                    }

                    const user = await transaction.user.update({
                        where: { id: targetUser.id },
                        data: { role: input.role },
                        select: ADMIN_USER_SELECT,
                    });

                    await this.sessionService.revokeAllSessions(
                        targetUser.id,
                        transaction,
                    );

                    return user;
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                },
            );

            this.logger.log(
                `Admin ${actor.userId} changed role for user ${updatedUser.id} to ${input.role}`,
            );
            return updatedUser;
        } catch (error: unknown) {
            this.throwAdminMutationError(error);
        }
    }

    async findUserSessions(
        userId: string,
        pagination: PaginationInput,
    ) {
        await this.findUser(userId);
        const window = getPaginationWindow(pagination);

        return this.sessionService.findActiveSessions(
            userId,
            window.take,
            window.skip,
        );
    }

    async revokeUserSessions(
        input: AdminRevokeSessionsInput,
        actor: AuthenticatedUser,
    ) {
        await this.findUser(input.userId);

        const result = await this.sessionService.revokeUserSessions(
            input.userId,
            input.sessionId,
        );

        if (input.sessionId !== undefined && result.count === 0) {
            throw new NotFoundException(
                'Active session not found for this user',
            );
        }

        this.logger.log(
            `Admin ${actor.userId} revoked ${input.sessionId ? `session ${input.sessionId}` : 'all sessions'} for user ${input.userId}`,
        );

        return {
            success: true,
            message:
                result.count === 0
                    ? 'No active sessions found'
                    : `Revoked ${result.count} session(s)`,
        };
    }

    async deleteUser(): Promise<never> {
        throw new ConflictException(
            'User deletion is unavailable until an archival and audit workflow is implemented',
        );
    }

    private async assertAnotherActiveAdminExists(
        transaction: Prisma.TransactionClient,
        excludedUserId: string,
    ): Promise<void> {
        const otherActiveAdminCount =
            await transaction.user.count({
                where: {
                    role: UserRole.ADMIN,
                    status: UserStatus.ACTIVE,
                    id: { not: excludedUserId },
                },
            });

        if (otherActiveAdminCount < 1) {
            throw new ConflictException(
                'At least one active administrator must remain',
            );
        }
    }

    private throwAdminMutationError(error: unknown): never {
        if (
            error instanceof
                Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2034'
        ) {
            throw new ConflictException(
                'A concurrent administrator change occurred; retry the operation',
            );
        }

        throwMappedPrismaError(error);
    }
}
