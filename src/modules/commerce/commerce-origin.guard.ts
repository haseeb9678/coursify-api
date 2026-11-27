import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLContext } from '../../common/types/graphql-context.type.js';

@Injectable()
export class CommerceOriginGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
        const origin = GqlExecutionContext.create(context).getContext<GraphQLContext>().req.headers.origin;
        if (origin !== this.config.getOrThrow<string>('app.frontendUrl')) {
            throw new ForbiddenException('Checkout requests must come from the configured website.');
        }
        return true;
    }
}
