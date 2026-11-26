import type { Prisma } from '../../../../generated/prisma/client.js';

export const ADMIN_USER_SELECT = {
    id: true,
    name: true,
    email: true,
    avatar: true,
    role: true,
    status: true,
    isEmailVerified: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.UserSelect;

export type AdminUserRecord = Prisma.UserGetPayload<{
    select: typeof ADMIN_USER_SELECT;
}>;
