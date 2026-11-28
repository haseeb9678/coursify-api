import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
    CookieOptions,
    Request,
    Response,
} from 'express';

import { AUTH_COOKIES } from '../constants/auth.constants.js';

import type { AuthTokens } from '../types/auth-tokens.type.js';
import type { LogoutTokens } from '../types/logout-tokens.type.js';

@Injectable()
export class CookieService {
    constructor(
        private readonly configService: ConfigService,
    ) { }

    // Common cookie configuration
    private getBaseCookieOptions(): CookieOptions {
        return {
            httpOnly: true,

            secure: this.configService.getOrThrow<boolean>(
                'cookie.secure',
            ),

            sameSite: this.configService.getOrThrow<
                'strict' | 'lax' | 'none'
            >('cookie.sameSite'),

            path: '/',
        };
    }

    // Set both authentication cookies
    setAuthCookies(
        response: Response,
        tokens: AuthTokens,
    ): void {
        const options = this.getBaseCookieOptions();
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('X-Access-Expires-At', String(tokens.accessExpiresAt.getTime()));
        response.cookie(AUTH_COOKIES.ACCESS_TOKEN, tokens.accessToken, {
            ...options, maxAge: Math.max(0, tokens.accessExpiresAt.getTime() - Date.now()),
        });
        response.cookie(AUTH_COOKIES.REFRESH_TOKEN, tokens.refreshToken, {
            ...options, maxAge: Math.max(0, tokens.refreshExpiresAt.getTime() - Date.now()),
        });
    }

    // Extract authentication tokens from request cookies
    getAuthCookies(request: Request): LogoutTokens {
        const cookies = request.cookies as
            | Record<string, unknown>
            | undefined;

        const accessToken =
            cookies?.[AUTH_COOKIES.ACCESS_TOKEN];

        const refreshToken =
            cookies?.[AUTH_COOKIES.REFRESH_TOKEN];

        const tokens: LogoutTokens = {};

        if (
            typeof accessToken === 'string' &&
            accessToken.length > 0
        ) {
            tokens.accessToken = accessToken;
        }

        if (
            typeof refreshToken === 'string' &&
            refreshToken.length > 0
        ) {
            tokens.refreshToken = refreshToken;
        }

        return tokens;
    }

    // Clear both authentication cookies
    clearAuthCookies(response: Response): void {
        response.setHeader('Cache-Control', 'private, no-store');
        const options = this.getBaseCookieOptions();

        response.clearCookie(
            AUTH_COOKIES.ACCESS_TOKEN,
            options,
        );

        response.clearCookie(
            AUTH_COOKIES.REFRESH_TOKEN,
            options,
        );
    }
}
