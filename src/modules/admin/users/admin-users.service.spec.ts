import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { Prisma } from '../../../generated/prisma/client.js';
import {
    UserRole,
    UserStatus,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { SessionService } from '../../auth/services/session.service.js';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type.js';
import { AdminUsersService, buildAdminUserWhere } from './admin-users.service.js';
import { AdminCreateUserInput } from './dto/admin-create-user.input.js';
import { AdminUpdateUserRoleInput } from './dto/admin-update-user-role.input.js';
import { AdminUpdateUserStatusInput } from './dto/admin-update-user-status.input.js';

describe('AdminUsersService', () => {
    const activeAdmin = {
        id: 'target-admin-id',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
    };
    const actor: AuthenticatedUser = {
        userId: 'acting-admin-id',
        sessionId: 'acting-session-id',
        role: UserRole.ADMIN,
    };

    let service: AdminUsersService;
    let module: TestingModule;
    let userModel: {
        findUnique: ReturnType<typeof vi.fn>;
        findUniqueOrThrow: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    let transactionClient: {
        user: typeof userModel;
        refreshSession: {
            updateMany: ReturnType<typeof vi.fn>;
        };
    };
    let prisma: {
        user: typeof userModel;
        $transaction: ReturnType<typeof vi.fn>;
    };
    let sessionService: {
        revokeAllSessions: ReturnType<typeof vi.fn>;
    };

    beforeEach(async () => {
        userModel = {
            findUnique: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            count: vi.fn(),
            update: vi.fn(),
        };
        transactionClient = {
            user: userModel,
            refreshSession: {
                updateMany: vi.fn(),
            },
        };
        prisma = {
            user: userModel,
            $transaction: vi.fn(
                async (
                    callback: (
                        transaction: typeof transactionClient,
                    ) => Promise<unknown>,
                ) => callback(transactionClient),
            ),
        };
        sessionService = {
            revokeAllSessions: vi.fn(),
        };

        module = await Test.createTestingModule({
            providers: [
                AdminUsersService,
                { provide: PrismaService, useValue: prisma },
                { provide: SessionService, useValue: sessionService },
            ],
        }).compile();

        service = module.get(AdminUsersService);
    });

    afterEach(async () => {
        await module.close();
    });

    it('combines search, status, verification, and date filters safely', () => {
        const from = new Date('2026-01-01T00:00:00.000Z');
        const to = new Date('2026-02-01T00:00:00.000Z');

        expect(
            buildAdminUserWhere({
                search: '  jane  ',
                status: UserStatus.ACTIVE,
                isEmailVerified: false,
                createdFrom: from,
                createdTo: to,
            }),
        ).toEqual({
            OR: [
                { name: { contains: 'jane', mode: 'insensitive' } },
                { email: { contains: 'jane', mode: 'insensitive' } },
            ],
            status: UserStatus.ACTIVE,
            isEmailVerified: false,
            createdAt: { gte: from, lte: to },
        });
    });

    it('rejects a date range with an end before its start', () => {
        expect(() =>
            buildAdminUserWhere({
                createdFrom: new Date('2026-02-01T00:00:00.000Z'),
                createdTo: new Date('2026-01-01T00:00:00.000Z'),
            }),
        ).toThrow('Created date range start must not be after its end');
    });

    it('prevents an administrator from suspending their own account', async () => {
        const input = new AdminUpdateUserStatusInput();
        input.userId = actor.userId;
        input.status = UserStatus.SUSPENDED;

        await expect(
            service.updateUserStatus(input, actor),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not allow admins to create or promote administrator accounts', async () => {
        const createInput = new AdminCreateUserInput();
        createInput.role = UserRole.ADMIN;

        await expect(
            service.createUser(createInput, actor),
        ).rejects.toBeInstanceOf(ForbiddenException);

        const roleInput = new AdminUpdateUserRoleInput();
        roleInput.userId = 'another-user-id';
        roleInput.role = UserRole.ADMIN;

        await expect(
            service.updateUserRole(roleInput, actor),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('prevents an administrator from changing their own role', async () => {
        const input = new AdminUpdateUserRoleInput();
        input.userId = actor.userId;
        input.role = UserRole.STUDENT;

        await expect(
            service.updateUserRole(input, actor),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('prevents deactivating the last active administrator', async () => {
        userModel.findUnique.mockResolvedValue(activeAdmin);
        userModel.count.mockResolvedValue(0);

        const input = new AdminUpdateUserStatusInput();
        input.userId = activeAdmin.id;
        input.status = UserStatus.INACTIVE;

        await expect(
            service.updateUserStatus(input, actor),
        ).rejects.toBeInstanceOf(ConflictException);

        expect(userModel.update).not.toHaveBeenCalled();
        expect(sessionService.revokeAllSessions).not.toHaveBeenCalled();
        expect(prisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            },
        );
    });

    it('revokes sessions in the same transaction as a status change', async () => {
        const changedUser = {
            id: activeAdmin.id,
            name: 'Target Admin',
            email: 'target@example.test',
            avatar: null,
            role: UserRole.ADMIN,
            status: UserStatus.INACTIVE,
            isEmailVerified: true,
            lastLoginAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        userModel.findUnique.mockResolvedValue(activeAdmin);
        userModel.count.mockResolvedValue(1);
        userModel.update.mockResolvedValue(changedUser);
        sessionService.revokeAllSessions.mockResolvedValue({
            count: 2,
        });

        const input = new AdminUpdateUserStatusInput();
        input.userId = activeAdmin.id;
        input.status = UserStatus.INACTIVE;

        await expect(
            service.updateUserStatus(input, actor),
        ).resolves.toEqual(changedUser);
        expect(sessionService.revokeAllSessions).toHaveBeenCalledWith(
            activeAdmin.id,
            transactionClient,
        );
    });
});
