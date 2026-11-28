import {
    Injectable,
    Logger,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { UsersService } from '../users/users.service.js';

import { TokenService } from './services/token.service.js';
import { SessionService } from './services/session.service.js';
import { authError, type AuthReason } from './auth-errors.js';
import { REFRESH_RETRY_WINDOW_MS } from './constants/auth.constants.js';

import type { RegisterInput } from './dto/register.input.js';
import type { LoginInput } from './dto/login.input.js';

import type { SessionMetadata } from './types/session-metadata.type.js';
import type { LogoutTokens } from './types/logout-tokens.type.js';

import {
    hashPassword,
    verifyPassword,
} from '../../common/utils/password.util.js';

import { UserStatus } from '../../generated/prisma/enums.js';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly tokenService: TokenService,
        private readonly sessionService: SessionService,
    ) { }

    // Register a new user
    async register(input: RegisterInput) {
        const { name, email, password } = input;

        const passwordHash = await hashPassword(password);

        return this.usersService.createUser({
            name,
            email,
            passwordHash,
        });
    }

    // Login an existing user
    async login(
        input: LoginInput,
        metadata: SessionMetadata,
    ) {
        const { email, password } = input;

        // Retrieve user credentials
        const user =
            await this.usersService.findUserByEmailForAuth(email);

        if (!user) {
            throw new UnauthorizedException(
                'Invalid email or password',
            );
        }

        // Verify password
        const isPasswordValid = await verifyPassword(
            user.passwordHash,
            password,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException(
                'Invalid email or password',
            );
        }

        // Check account status
        if (user.status !== UserStatus.ACTIVE) {
            throw new ForbiddenException(
                'Your account is not active',
            );
        }

        // Update last login and retrieve safe user data
        const authenticatedUser =
            await this.usersService.updateLastLogin(user.id);

        // Create authentication session
        const session = await this.createAuthSession(
            user.id,
            metadata,
        );

        return {
            user: authenticatedUser,
            ...session,
        };
    }

    // Get the currently authenticated user
    async me(userId: string) {
        const user =
            await this.usersService.findUserById(userId);

        if (!user) {
            throw new UnauthorizedException(
                'User no longer exists',
            );
        }

        if (user.status !== UserStatus.ACTIVE) {
            throw new ForbiddenException(
                'Your account is not active',
            );
        }

        return user;
    }

    async refresh(refreshToken: string | undefined, requestId: string) {
        if (!refreshToken) throw this.rejectRefresh('REFRESH_COOKIE_MISSING');
        const payload = await this.tokenService.verifyRefreshToken(refreshToken);
        const { sid: sessionId, sub: userId } = payload;
        const currentTokenHash = this.tokenService.hashRefreshToken(refreshToken);
        const requestHash = this.tokenService.hashRefreshToken(requestId);
        const session = await this.readRefreshSession(sessionId, userId);
        const issuedAt = new Date();
        if (session.refreshTokenHash !== currentTokenHash || session.refreshRequestHash === requestHash) {
            return this.resolveRotation(session, currentTokenHash, requestHash, requestId);
        }

        const expiresAt = this.tokenService.sessionExpiry(issuedAt, session.createdAt);
        if (expiresAt.getTime() <= Date.now()) throw this.rejectRefresh('SESSION_EXPIRED');
        const tokens = await this.tokenService.generateTokens(
            userId, sessionId, issuedAt, expiresAt, { requestId, currentTokenHash },
        );
        const rotated = await this.sessionService.rotateSession({
            sessionId, userId, currentTokenHash, requestHash, expiresAt, rotatedAt: issuedAt,
            newTokenHash: this.tokenService.hashRefreshToken(tokens.refreshToken),
        });
        if (rotated) return tokens;

        const latest = await this.readRefreshSession(sessionId, userId);
        return this.resolveRotation(latest, currentTokenHash, requestHash, requestId);
    }

    private async readRefreshSession(sessionId: string, userId: string) {
        const session = await this.sessionService.findRefreshSession(sessionId, userId);
        if (!session || session.revokedAt) throw this.rejectRefresh('SESSION_REVOKED');
        if (session.expiresAt.getTime() <= Date.now()) throw this.rejectRefresh('SESSION_EXPIRED');
        if (session.user.status !== UserStatus.ACTIVE) throw this.rejectRefresh('ACCOUNT_INACTIVE');
        return session;
    }

    private async resolveRotation(
        session: Awaited<ReturnType<AuthService['readRefreshSession']>>,
        tokenHash: string, requestHash: string, requestId: string,
    ) {
        const { refreshRotatedAt, previousRefreshTokenHash } = session;
        if (previousRefreshTokenHash && refreshRotatedAt &&
            Date.now() - refreshRotatedAt.getTime() < REFRESH_RETRY_WINDOW_MS) {
            if (session.refreshRequestHash === requestHash &&
                (tokenHash === previousRefreshTokenHash || tokenHash === session.refreshTokenHash)) {
                const tokens = await this.tokenService.generateTokens(
                    session.userId, session.id, refreshRotatedAt, session.expiresAt,
                    { requestId, currentTokenHash: previousRefreshTokenHash },
                );
                if (this.tokenService.hashRefreshToken(tokens.refreshToken) === session.refreshTokenHash) return tokens;
            }
            if (tokenHash === previousRefreshTokenHash) throw this.rejectRefresh('REFRESH_ROTATION_CONFLICT');
        }
        throw this.rejectRefresh('REFRESH_TOKEN_INVALID');
    }

    private rejectRefresh(reason: AuthReason) {
        this.logger.debug(`Session refresh rejected (${reason})`);
        return authError(reason);
    }

    // Logout from the current authentication session
    async logout({
        accessToken,
        refreshToken,
    }: LogoutTokens): Promise<void> {

        // Attempt logout using the access token
        if (accessToken) {
            const payload = await this.tokenService
                .verifyAccessToken(accessToken)
                .catch((error: unknown) => {
                    if (error instanceof UnauthorizedException) {
                        return null;
                    }

                    throw error;
                });

            if (payload) {
                // Revoke the session identified by the access token
                await this.sessionService.revokeSession(
                    payload.sid,
                    payload.sub,
                );

                return;
            }
        }

        // Fall back to refresh token if access token
        // is missing, invalid or expired
        if (refreshToken) {
            const payload = await this.tokenService
                .verifyRefreshToken(refreshToken)
                .catch((error: unknown) => {
                    if (error instanceof UnauthorizedException) {
                        return null;
                    }

                    throw error;
                });

            if (payload) {
                // Generate the hash of the supplied refresh token
                const refreshTokenHash =
                    this.tokenService.hashRefreshToken(
                        refreshToken,
                    );

                // Revoke only if the refresh token hash matches
                await this.sessionService.revokeSession(
                    payload.sid,
                    payload.sub,
                    refreshTokenHash,
                );
            }
        }
    }

    // Reusable authentication session creation
    private async createAuthSession(
        userId: string,
        metadata: SessionMetadata,
    ) {
        const sessionId = randomUUID();

        const createdAt = new Date(Math.floor(Date.now() / 1000) * 1000);
        const expiresAt = this.tokenService.sessionExpiry(createdAt, createdAt);
        const tokens = await this.tokenService.generateTokens(
            userId,
            sessionId,
            createdAt,
            expiresAt,
        );

        // Hash refresh token
        const refreshTokenHash =
            this.tokenService.hashRefreshToken(
                tokens.refreshToken,
            );

        // Store session in PostgreSQL
        await this.sessionService.createSession({
            id: sessionId,
            userId,
            refreshTokenHash,
            expiresAt,
            createdAt,
            ...metadata,
        });

        return {
            tokens,
        };
    }
}
