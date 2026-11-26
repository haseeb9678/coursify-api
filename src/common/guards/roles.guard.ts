import {
    ForbiddenException,
    Injectable,
    UnauthorizedException,
    type CanActivate,
    type ExecutionContext,
} from '@nestjs/common';

import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';

import { UserRole } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type.js';
import type { GraphQLContext } from '../types/graphql-context.type.js';
import { ROLES_METADATA_KEY } from '../decorators/roles.decorator.js';

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const user = value as Record<string, unknown>;

    return (
        typeof user.userId === 'string' &&
        typeof user.sessionId === 'string' &&
        Object.values(UserRole).some((role) => role === user.role)
    );
}

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) { }

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles =
            this.reflector.getAllAndOverride<UserRole[]>(
                ROLES_METADATA_KEY,
                [context.getHandler(), context.getClass()],
            );

        if (!requiredRoles?.length) {
            return true;
        }

        const request = GqlExecutionContext
            .create(context)
            .getContext<GraphQLContext>()
            .req;
        const user: unknown = request.user;

        if (!isAuthenticatedUser(user)) {
            throw new UnauthorizedException(
                'Authentication required',
            );
        }

        if (!requiredRoles.includes(user.role)) {
            throw new ForbiddenException(
                'You do not have permission to perform this operation',
            );
        }

        return true;
    }
}
