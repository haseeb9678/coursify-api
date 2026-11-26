import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service.js';

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
                userAgent: data.userAgent ?? null,
                ipAddress: data.ipAddress ?? null,
            },
            omit: {
                refreshTokenHash: true,
            },
        });
    }

    // Find a session by ID
    async findSessionById(sessionId: string) {
        return this.prisma.refreshSession.findUnique({
            where: {
                id: sessionId,
            },
            omit: {
                refreshTokenHash: true,
            },
        });
    }

    // Find an active authentication session
    async findActiveSession(
        sessionId: string,
        userId: string,
    ) {
        return this.prisma.refreshSession.findFirst({
            where: {
                id: sessionId,
                userId,
                revokedAt: null,
                expiresAt: {
                    gt: new Date(),
                },
            },
            omit: {
                refreshTokenHash: true,
            },
        });
    }

    // Rotate refresh token atomically
    async rotateSession(
        data: RotateSessionData,
    ): Promise<void> {
        const result =
            await this.prisma.refreshSession.updateMany({
                where: {
                    id: data.sessionId,
                    userId: data.userId,
                    refreshTokenHash: data.currentTokenHash,
                    revokedAt: null,
                    expiresAt: {
                        gt: new Date(),
                    },
                },
                data: {
                    refreshTokenHash: data.newTokenHash,
                },
            });

        if (result.count !== 1) {
            throw new UnauthorizedException(
                'Invalid or expired refresh session',
            );
        }
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
                        ? { refreshTokenHash }
                        : {}),
                },
                data: {
                    revokedAt: new Date(),
                },
            });

        return result.count > 0;
    }

    // Revoke all sessions of a user
    async revokeAllSessions(userId: string) {
        return this.prisma.refreshSession.updateMany({
            where: {
                userId,
                revokedAt: null,
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