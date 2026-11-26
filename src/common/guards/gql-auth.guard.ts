import {
    Injectable,
    type ExecutionContext,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';
import { GqlExecutionContext } from '@nestjs/graphql';

import type { Request } from 'express';

import type { GraphQLContext } from '../types/graphql-context.type.js';

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
    override getRequest(
        context: ExecutionContext,
    ): Request {
        const gqlContext = GqlExecutionContext.create(context);

        return gqlContext.getContext<GraphQLContext>().req;
    }
}