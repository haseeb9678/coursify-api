export interface CreateSessionData {
    id: string;
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;

    userAgent?: string;
    ipAddress?: string;
}

export interface RotateSessionData {
    sessionId: string;
    userId: string;
    currentTokenHash: string;
    newTokenHash: string;
}