import {
    createParamDecorator,
    UnauthorizedException,
    type ExecutionContext,
} from '@nestjs/common';

import { GqlExecutionContext } from '@nestjs/graphql';

import type { GraphQLContext } from '../types/graphql-context.type.js';

import type { AuthenticatedUser } from '../../modules/auth/types/authenticated-user.type.js';

export const CurrentUser = createParamDecorator(
    (
        _data: unknown,
        context: ExecutionContext,
    ): AuthenticatedUser => {
        const gqlContext = GqlExecutionContext.create(context);

        const { req } =
            gqlContext.getContext<GraphQLContext>();

        const user = req.user as AuthenticatedUser | undefined;

        if (!user) {
            throw new UnauthorizedException(
                'Authentication required',
            );
        }

        return user;
    },
);