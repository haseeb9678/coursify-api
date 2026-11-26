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

    // Set access token cookie
    setAccessToken(
        response: Response,
        token: string,
    ): void {
        const expiresIn =
            this.configService.getOrThrow<number>(
                'jwt.accessExpiresIn',
            );

        response.cookie(
            AUTH_COOKIES.ACCESS_TOKEN,
            token,
            {
                ...this.getBaseCookieOptions(),
                maxAge: expiresIn * 1000,
            },
        );
    }

    // Set refresh token cookie
    setRefreshToken(
        response: Response,
        token: string,
        expiresAt?: Date,
    ): void {
        const expiresIn =
            this.configService.getOrThrow<number>(
                'jwt.refreshExpiresIn',
            );

        const maxAge = expiresAt
            ? Math.max(0, expiresAt.getTime() - Date.now())
            : expiresIn * 1000;

        response.cookie(
            AUTH_COOKIES.REFRESH_TOKEN,
            token,
            {
                ...this.getBaseCookieOptions(),
                maxAge,
            },
        );
    }

    // Set both authentication cookies
    setAuthCookies(
        response: Response,
        tokens: AuthTokens,
        sessionExpiresAt?: Date,
    ): void {
        this.setAccessToken(
            response,
            tokens.accessToken,
        );

        this.setRefreshToken(
            response,
            tokens.refreshToken,
            sessionExpiresAt,
        );
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