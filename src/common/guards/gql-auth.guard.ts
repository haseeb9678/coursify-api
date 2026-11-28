import {
    Injectable,
    type ExecutionContext,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';

import type { Request } from 'express';

import type { GraphQLContext } from '../types/graphql-context.type.js';
import { AUTH_COOKIES } from '../../modules/auth/constants/auth.constants.js';
import { authError } from '../../modules/auth/auth-errors.js';

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
    override handleRequest<T>(
        error: unknown, user: T, info: unknown, context: ExecutionContext,
    ): T {
        if (error) throw error;
        const { req, res } = GqlExecutionContext.create(context).getContext<GraphQLContext>();
        if (!user) {
            const cookies = req.cookies as Record<string, unknown> | undefined;
            throw authError(!cookies?.[AUTH_COOKIES.ACCESS_TOKEN]
                ? 'ACCESS_TOKEN_MISSING'
                : info instanceof Error && info.name === 'TokenExpiredError'
                    ? 'ACCESS_TOKEN_EXPIRED'
                    : 'ACCESS_TOKEN_INVALID');
        }
        if (typeof user === 'object' && 'accessExpiresAt' in user && typeof user.accessExpiresAt === 'number') {
            res.setHeader('X-Access-Expires-At', String(user.accessExpiresAt));
        }
        res.setHeader('Cache-Control', 'private, no-store');
        return user;
    }

    override getRequest(
        context: ExecutionContext,
    ): Request {
        const gqlContext = GqlExecutionContext.create(context);

        return gqlContext.getContext<GraphQLContext>().req;
    }
}
