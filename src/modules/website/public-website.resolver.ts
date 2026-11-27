import { Injectable, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import type { GraphQLContext } from '../../common/types/graphql-context.type.js';
import { WebsiteService } from './website.service.js';
import { PublicHero, PublicPopups } from './website.types.js';

@Injectable()
export class OptionalWebsiteAuthGuard extends GqlAuthGuard {
    override handleRequest<TUser>(error: unknown, user: TUser): TUser {
        if (error && !(error instanceof UnauthorizedException)) throw error;
        return user;
    }
}

@Resolver()
export class PublicWebsiteResolver {
    constructor(private readonly service: WebsiteService) {}

    @Query(() => PublicHero)
    publicHero() {
        return this.service.publicHero();
    }

    @Query(() => PublicPopups)
    @UseGuards(OptionalWebsiteAuthGuard)
    publicPromotionalPopups(
        @Args('path', { type: () => String }) path: string,
        @Context() context: GraphQLContext,
    ) {
        return this.service.publicPopups(path, Boolean(context.req.user));
    }
}
