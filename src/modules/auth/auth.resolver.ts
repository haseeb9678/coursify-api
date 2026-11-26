import { UseGuards } from '@nestjs/common';

import {
    Args,
    Context,
    Mutation,
    Query,
    Resolver,
} from '@nestjs/graphql';

import { AuthService } from './auth.service.js';
import { CookieService } from './services/cookie.service.js';

import { RegisterInput } from './dto/register.input.js';
import { LoginInput } from './dto/login.input.js';

import { AuthResponse } from './responses/auth.response.js';
import { User } from '../users/entities/user.entity.js';

import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

import {
    MutationResponse,
    createMutationResponse,
} from '../../common/responses/mutation.response.js';

import type { GraphQLContext } from '../../common/types/graphql-context.type.js';

import type { AuthenticatedUser } from './types/authenticated-user.type.js';

@Resolver()
export class AuthResolver {
    constructor(
        private readonly authService: AuthService,
        private readonly cookieService: CookieService,
    ) { }

    // Register a new user
    @Mutation(() => AuthResponse, {
        name: 'register',
        description: 'Register a new student account',
    })
    async register(
        @Args('input') input: RegisterInput,
    ): Promise<AuthResponse> {
        const user = await this.authService.register(input);

        return {
            ...createMutationResponse(
                'Account registered successfully',
            ),
            user,
        };
    }

    // Authenticate an existing user
    @Mutation(() => AuthResponse, {
        name: 'login',
        description: 'Authenticate an existing user',
    })
    async login(
        @Args('input') input: LoginInput,
        @Context() context: GraphQLContext,
    ): Promise<AuthResponse> {
        const { req, res } = context;

        const result = await this.authService.login(input, {
            userAgent: req.get('user-agent') ?? 'Unknown',

            ...(req.ip
                ? { ipAddress: req.ip }
                : {}),
        });

        // Set authentication cookies
        this.cookieService.setAuthCookies(
            res,
            result.tokens,
            result.sessionExpiresAt,
        );

        return {
            ...createMutationResponse('Login successful'),
            user: result.user,
        };
    }

    // Get the currently authenticated user
    @UseGuards(GqlAuthGuard)
    @Query(() => User, {
        name: 'me',
        description: 'Retrieve the currently authenticated user',
    })
    async me(
        @CurrentUser() user: AuthenticatedUser,
    ): Promise<User> {
        return this.authService.me(user.userId);
    }

    // Logout from the current authentication session
    @Mutation(() => MutationResponse, {
        name: 'logout',
        description: 'Logout from the current authentication session',
    })
    async logout(
        @Context() context: GraphQLContext,
    ): Promise<MutationResponse> {
        const { req, res } = context;

        // Extract authentication tokens from cookies
        const tokens =
            this.cookieService.getAuthCookies(req);

        // Revoke the current authentication session
        await this.authService.logout(tokens);

        // Clear both authentication cookies
        this.cookieService.clearAuthCookies(res);

        return createMutationResponse(
            'Logged out successfully',
        );
    }
}