import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { REFRESH_RETRY_WINDOW_MS } from '../constants/auth.constants.js';

import type {
    CreateSessionData,
    RotateSessionData,
} from '../types/session.type.js';

@Injectable()
export class SessionService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    // Create a new authentication session
    async createSession(data: CreateSessionData) {
        return this.prisma.refreshSession.create({
            data: {
                id: data.id,
                userId: data.userId,
                refreshTokenHash: data.refreshTokenHash,
                expiresAt: data.expiresAt,
                createdAt: data.createdAt,
                userAgent: data.userAgent ?? null,
                ipAddress: data.ipAddress ?? null,
            },
            select: { id: true },
        });
    }

    // Find a session by ID
    async findSessionById(sessionId: string) {
        return this.prisma.refreshSession.findUnique({
            where: {
                id: sessionId,
            },
            select: {
                id: true, userId: true, expiresAt: true, revokedAt: true,
            },
        });
    }

    async findRefreshSession(
        sessionId: string,
        userId: string,
    ) {
        return this.prisma.refreshSession.findUnique({
            where: {
                id: sessionId,
                userId,
            },
            include: { user: { select: { status: true } } },
        });
    }

    // Rotate refresh token atomically
    async rotateSession(
        data: RotateSessionData,
    ): Promise<boolean> {
        const result =
            await this.prisma.refreshSession.updateMany({
                where: {
                    id: data.sessionId,
                    userId: data.userId,
                    refreshTokenHash: data.currentTokenHash,
                    revokedAt: null,
                    user: { status: 'ACTIVE' },
                    expiresAt: {
                        gt: new Date(),
                    },
                },
                data: {
                    refreshTokenHash: data.newTokenHash,
                    previousRefreshTokenHash: data.currentTokenHash,
                    refreshRequestHash: data.requestHash,
                    refreshRotatedAt: data.rotatedAt,
                    expiresAt: data.expiresAt,
                },
            });

        return result.count === 1;
    }

    // Revoke the current authentication session
    async revokeSession(
        sessionId: string,
        userId: string,
        refreshTokenHash?: string,
    ): Promise<boolean> {
        const result =
            await this.prisma.refreshSession.updateMany({
                where: {
                    id: sessionId,
                    userId,
                    revokedAt: null,

                    ...(refreshTokenHash !== undefined
                        ? { OR: [
                            { refreshTokenHash },
                            {
                                previousRefreshTokenHash: refreshTokenHash,
                                refreshRotatedAt: { gt: new Date(Date.now() - REFRESH_RETRY_WINDOW_MS) },
                            },
                        ] }
                        : {}),
                },
                data: {
                    revokedAt: new Date(),
                },
            });

        return result.count > 0;
    }

    // Find active sessions of a user
    async findActiveSessions(
        userId: string,
        take: number,
        skip = 0,
    ) {
        return this.prisma.refreshSession.findMany({
            where: {
                userId,
                revokedAt: null,
                expiresAt: {
                    gt: new Date(),
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            skip,
            take,
            select: {
                id: true,
                userId: true,
                userAgent: true,
                ipAddress: true,
                createdAt: true,
                updatedAt: true,
                expiresAt: true,
                revokedAt: true,
            },
        });
    }

    // Revoke all sessions of a user
    async revokeAllSessions(
        userId: string,
        transaction?: Prisma.TransactionClient,
    ) {
        const client = transaction ?? this.prisma;

        return client.refreshSession.updateMany({
            where: {
                userId,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });
    }

    async revokeUserSessions(
        userId: string,
        sessionId?: string,
    ) {
        return this.prisma.refreshSession.updateMany({
            where: {
                userId,
                revokedAt: null,
                expiresAt: {
                    gt: new Date(),
                },
                ...(sessionId !== undefined ? { id: sessionId } : {}),
            },
            data: {
                revokedAt: new Date(),
            },
        });
    }

    // Delete expired sessions
    async deleteExpiredSessions() {
        return this.prisma.refreshSession.deleteMany({
            where: {
                expiresAt: {
                    lte: new Date(),
                },
            },
        });
    }
}
