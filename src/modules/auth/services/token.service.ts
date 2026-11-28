import { Injectable, Logger } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash, createHmac } from 'node:crypto';

import { authError } from '../auth-errors.js';
import type { AccessTokenPayload, RefreshTokenPayload } from '../types/jwt-payload.type.js';
import type { AuthTokens } from '../types/auth-tokens.type.js';

@Injectable()
export class TokenService {
    private readonly logger = new Logger(TokenService.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    sessionExpiry(issuedAt: Date, createdAt: Date): Date {
        const idle = this.configService.getOrThrow<number>('jwt.refreshExpiresIn');
        const maximum = this.configService.getOrThrow<number>('jwt.sessionMaxAge');
        const expiresAt = Math.min(issuedAt.getTime() + idle * 1000, createdAt.getTime() + maximum * 1000);
        return new Date(Math.floor(expiresAt / 1000) * 1000);
    }

    async generateTokens(
        userId: string, sessionId: string, issuedAt: Date, refreshExpiresAt: Date,
        retry?: { requestId: string; currentTokenHash: string },
    ): Promise<AuthTokens> {
        const iat = Math.floor(issuedAt.getTime() / 1000);
        const refreshExp = Math.floor(refreshExpiresAt.getTime() / 1000);
        const accessExp = Math.min(refreshExp, iat + this.configService.getOrThrow<number>('jwt.accessExpiresIn'));
        const refreshSecret = this.configService.getOrThrow<string>('jwt.refreshSecret');
        // Within the retry window, the same request can reconstruct its exact refresh token.
        const refreshId = retry
            ? createHmac('sha256', refreshSecret)
                .update(`refresh-rotation:${sessionId}:${retry.requestId}:${retry.currentTokenHash}`).digest('hex')
            : randomUUID();
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync({
                sub: userId, sid: sessionId, jti: randomUUID(), type: 'access', iat, exp: accessExp,
            } satisfies AccessTokenPayload, {
                secret: this.configService.getOrThrow<string>('jwt.accessSecret'), algorithm: 'HS256',
            }),
            this.jwtService.signAsync({
                sub: userId, sid: sessionId, jti: refreshId, type: 'refresh', iat, exp: refreshExp,
            } satisfies RefreshTokenPayload, {
                secret: refreshSecret, algorithm: 'HS256',
            }),
        ]);
        return { accessToken, refreshToken, accessExpiresAt: new Date(accessExp * 1000), refreshExpiresAt };
    }

    verifyAccessToken(token: string) {
        return this.verifyToken<AccessTokenPayload>(token, 'access');
    }

    verifyRefreshToken(token: string) {
        return this.verifyToken<RefreshTokenPayload>(token, 'refresh');
    }

    private async verifyToken<T extends AccessTokenPayload | RefreshTokenPayload>(token: string, type: T['type']): Promise<T> {
        const secret = this.configService.getOrThrow<string>(`jwt.${type}Secret`);
        const invalid = type === 'access' ? 'ACCESS_TOKEN_INVALID' : 'REFRESH_TOKEN_INVALID';
        try {
            const payload = await this.jwtService.verifyAsync<T>(token, { secret, algorithms: ['HS256'] });
            if (payload.type !== type || typeof payload.sub !== 'string' || typeof payload.sid !== 'string' ||
                typeof payload.jti !== 'string' || typeof payload.exp !== 'number') {
                throw authError(invalid);
            }
            return payload;
        } catch (error) {
            const reason = error instanceof TokenExpiredError
                ? type === 'access' ? 'ACCESS_TOKEN_EXPIRED' : 'REFRESH_TOKEN_EXPIRED'
                : invalid;
            this.logger.debug(`Token rejected (${reason})`);
            throw authError(reason);
        }
    }

    hashRefreshToken(value: string): string {
        return createHash('sha256').update(value).digest('hex');
    }
}
