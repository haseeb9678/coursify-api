import { UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';

export type AuthReason =
    | 'ACCESS_TOKEN_MISSING'
    | 'ACCESS_TOKEN_INVALID'
    | 'ACCESS_TOKEN_EXPIRED'
    | 'REFRESH_COOKIE_MISSING'
    | 'REFRESH_TOKEN_INVALID'
    | 'REFRESH_TOKEN_EXPIRED'
    | 'REFRESH_ROTATION_CONFLICT'
    | 'SESSION_EXPIRED'
    | 'SESSION_REVOKED'
    | 'ACCOUNT_INACTIVE';

const messages: Record<AuthReason, string> = {
    ACCESS_TOKEN_MISSING: 'Sign in to continue',
    ACCESS_TOKEN_INVALID: 'Invalid access token',
    ACCESS_TOKEN_EXPIRED: 'Access token expired',
    REFRESH_COOKIE_MISSING: 'No refresh session was provided',
    REFRESH_TOKEN_INVALID: 'Invalid refresh token',
    REFRESH_TOKEN_EXPIRED: 'Refresh token expired',
    REFRESH_ROTATION_CONFLICT: 'The session was refreshed by another request',
    SESSION_EXPIRED: 'Your session has expired',
    SESSION_REVOKED: 'Your session is no longer active',
    ACCOUNT_INACTIVE: 'Your account is not active',
};

export function authError(authReason: AuthReason) {
    const response = { message: messages[authReason], authReason };
    if (authReason === 'ACCOUNT_INACTIVE') return new ForbiddenException(response);
    return authReason === 'REFRESH_ROTATION_CONFLICT'
        ? new ConflictException(response)
        : new UnauthorizedException(response);
}
