export interface CreateSessionData {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    createdAt: Date;

    userAgent?: string;
    ipAddress?: string;
}

export interface RotateSessionData {
    sessionId: string;
    userId: string;
    currentTokenHash: string;
    newTokenHash: string;
    requestHash: string;
    rotatedAt: Date;
    expiresAt: Date;
}
