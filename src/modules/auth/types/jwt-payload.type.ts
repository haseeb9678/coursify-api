export interface BaseJwtPayload {
    sub: string;
    sid: string;
    jti: string;

    iat?: number;
    exp?: number;
}

export interface AccessTokenPayload extends BaseJwtPayload {
    type: 'access';
}

export interface RefreshTokenPayload extends BaseJwtPayload {
    type: 'refresh';
}