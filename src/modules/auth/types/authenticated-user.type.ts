import type { UserRole } from '../../../generated/prisma/enums.js';

export interface AuthenticatedUser {
    userId: string;
    sessionId: string;
    role: UserRole;
    accessExpiresAt?: number;
}
