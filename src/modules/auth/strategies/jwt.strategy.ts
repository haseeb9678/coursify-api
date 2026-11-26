import {
    Injectable,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';

import type { Request } from 'express';

import { UsersService } from '../../users/users.service.js';
import { SessionService } from '../services/session.service.js';

import { AUTH_COOKIES } from '../constants/auth.constants.js';
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
            throw new UnauthorizedException(
                'Invalid access token',
            );
        }

        // Verify session and user
        const [session, user] = await Promise.all([
            this.sessionService.findActiveSession(
                payload.sid,
                payload.sub,
            ),

            this.usersService.findUserById(payload.sub),
        ]);

        if (!session) {
            throw new UnauthorizedException(
                'Session is invalid or expired',
            );
        }

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

        return {
            userId: user.id,
            sessionId: session.id,
            role: user.role,
        };
    }
}