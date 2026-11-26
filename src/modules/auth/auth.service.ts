import {
    Injectable,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { UsersService } from '../users/users.service.js';

import { TokenService } from './services/token.service.js';
import { SessionService } from './services/session.service.js';

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

        // Generate JWT tokens
        const tokens = await this.tokenService.generateTokens(
            userId,
            sessionId,
        );

        // Hash refresh token
        const refreshTokenHash =
            this.tokenService.hashRefreshToken(
                tokens.refreshToken,
            );

        // Determine session expiry from the signed token
        const payload =
            await this.tokenService.verifyRefreshToken(
                tokens.refreshToken,
            );

        if (typeof payload.exp !== 'number') {
            throw new UnauthorizedException(
                'Invalid refresh token expiration',
            );
        }

        const expiresAt = new Date(payload.exp * 1000);

        // Store session in PostgreSQL
        await this.sessionService.createSession({
            id: sessionId,
            userId,
            refreshTokenHash,
            expiresAt,
            ...metadata,
        });

        return {
            tokens,
            sessionExpiresAt: expiresAt,
        };
    }
}