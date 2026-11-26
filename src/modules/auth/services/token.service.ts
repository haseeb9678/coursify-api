import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { randomUUID, createHash } from 'node:crypto';
import { AccessTokenPayload, RefreshTokenPayload } from '../types/jwt-payload.type.js';
import { AuthTokens } from '../types/auth-tokens.type.js';

@Injectable()
export class TokenService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    // Generate access token
    async generateAccessToken(
        userId: string,
        sessionId: string,
    ): Promise<string> {

        const payload: AccessTokenPayload = {
            sub: userId,
            sid: sessionId,
            jti: randomUUID(),
            type: 'access',
        };

        return this.jwtService.signAsync(payload, {
            secret: this.configService.getOrThrow<string>(
                'jwt.accessSecret',
            ),
            expiresIn: this.configService.getOrThrow<number>(
                'jwt.accessExpiresIn',
            ),
            algorithm: 'HS256',
        });
    }

    // Generate refresh token
    async generateRefreshToken(
        userId: string,
        sessionId: string,
    ): Promise<string> {

        const payload: RefreshTokenPayload = {
            sub: userId,
            sid: sessionId,
            jti: randomUUID(),
            type: 'refresh',
        };

        return this.jwtService.signAsync(payload, {
            secret: this.configService.getOrThrow<string>(
                'jwt.refreshSecret',
            ),
            expiresIn: this.configService.getOrThrow<number>(
                'jwt.refreshExpiresIn',
            ),
            algorithm: 'HS256',
        });
    }

    // Generate both tokens
    async generateTokens(
        userId: string,
        sessionId: string,
    ): Promise<AuthTokens> {

        const [accessToken, refreshToken] = await Promise.all([
            this.generateAccessToken(userId, sessionId),
            this.generateRefreshToken(userId, sessionId),
        ]);

        return {
            accessToken,
            refreshToken,
        };
    }

    // Verify access token
    async verifyAccessToken(
        token: string,
    ): Promise<AccessTokenPayload> {

        const secret = this.configService.getOrThrow<string>(
            'jwt.accessSecret',
        );

        try {
            const payload =
                await this.jwtService.verifyAsync<AccessTokenPayload>(
                    token,
                    {
                        secret,
                        algorithms: ['HS256'],
                    },
                );

            if (
                payload.type !== 'access' ||
                typeof payload.sub !== 'string' ||
                typeof payload.sid !== 'string' ||
                typeof payload.jti !== 'string' ||
                typeof payload.exp !== 'number'
            ) {
                throw new UnauthorizedException();
            }

            return payload;

        } catch {
            throw new UnauthorizedException(
                'Invalid or expired access token',
            );
        }
    }

    // Verify refresh token
    async verifyRefreshToken(
        token: string,
    ): Promise<RefreshTokenPayload> {

        const secret = this.configService.getOrThrow<string>(
            'jwt.refreshSecret',
        );

        try {
            const payload =
                await this.jwtService.verifyAsync<RefreshTokenPayload>(
                    token,
                    {
                        secret,
                        algorithms: ['HS256'],
                    },
                );

            if (
                payload.type !== 'refresh' ||
                typeof payload.sub !== 'string' ||
                typeof payload.sid !== 'string' ||
                typeof payload.jti !== 'string' ||
                typeof payload.exp !== 'number'
            ) {
                throw new UnauthorizedException();
            }

            return payload;

        } catch {
            throw new UnauthorizedException(
                'Invalid or expired refresh token',
            );
        }
    }

    // Hash refresh token before storing in database
    hashRefreshToken(token: string): string {
        return createHash('sha256')
            .update(token)
            .digest('hex');
    }
}