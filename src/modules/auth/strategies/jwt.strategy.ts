import {
    Injectable,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';

import type { Request } from 'express';

import { UsersService } from '../../users/users.service.js';
import { SessionService } from '../services/session.service.js';

import { AUTH_COOKIES } from '../constants/auth.constants.js';
import { authError } from '../auth-errors.js';
import { UserStatus } from '../../../generated/prisma/enums.js';

import type { AccessTokenPayload } from '../types/jwt-payload.type.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';

// Extract access token from HttpOnly cookie
function extractAccessToken(request: Request): string | null {
    const cookies = request.cookies as
        | Record<string, unknown>
        | undefined;

    const token = cookies?.[AUTH_COOKIES.ACCESS_TOKEN];

    return typeof token === 'string' && token.length > 0
        ? token
        : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(
    Strategy,
    'jwt',
) {
    constructor(
        configService: ConfigService,
        private readonly usersService: UsersService,
        private readonly sessionService: SessionService,
    ) {
        super({
            jwtFromRequest: extractAccessToken,

            secretOrKey: configService.getOrThrow<string>(
                'jwt.accessSecret',
            ),

            ignoreExpiration: false,

            algorithms: ['HS256'],
        });
    }

    async validate(
        payload: AccessTokenPayload,
    ): Promise<AuthenticatedUser> {
        // Validate JWT payload
        if (
            payload.type !== 'access' ||
            typeof payload.sub !== 'string' ||
            typeof payload.sid !== 'string' ||
            typeof payload.jti !== 'string' ||
            typeof payload.exp !== 'number'
        ) {
            throw authError('ACCESS_TOKEN_INVALID');
        }

        // Verify session and user
        const [session, user] = await Promise.all([
            this.sessionService.findSessionById(payload.sid),

            this.usersService.findUserById(payload.sub),
        ]);

        if (!session || session.userId !== payload.sub || session.revokedAt || !user) {
            throw authError('SESSION_REVOKED');
        }
        if (session.expiresAt.getTime() <= Date.now()) throw authError('SESSION_EXPIRED');
        if (user.status !== UserStatus.ACTIVE) throw authError('ACCOUNT_INACTIVE');

        return {
            userId: user.id,
            sessionId: session.id,
            role: user.role,
            accessExpiresAt: Math.min(payload.exp * 1000, session.expiresAt.getTime()),
        };
    }
}
