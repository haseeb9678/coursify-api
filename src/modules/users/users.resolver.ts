import { Args, ID, Mutation, Query, Resolver } from "@nestjs/graphql";
import { UseGuards } from "@nestjs/common";

import { GqlAuthGuard } from "../../common/guards/gql-auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { UserRole } from "../../generated/prisma/enums.js";

import { User } from "./entities/user.entity.js";
import { UsersService } from "./users.service.js";
import { NotFoundException, ParseUUIDPipe } from "@nestjs/common";
import { CreateUserInput } from "./dto/create-user.input.js";
import { hashPassword } from "../../common/utils/password.util.js";
import { createMutationResponse } from "../../common/responses/mutation.response.js";
import { CreateUserResponse } from "./responses/create-user.response.js";


@Resolver(() => User)
export class UsersResolver {
    constructor(private readonly usersService: UsersService) { }

    //Create a User
    @Mutation(() => CreateUserResponse)
    async createUser(
        @Args("input") input: CreateUserInput
    ) {
        const { name, email, password } = input
        const passwordHash = await hashPassword(password)

        const user = await this.usersService.createUser({
            name, email, passwordHash
        })
        return {
            ...createMutationResponse("User created successfully"),
            user
        }
    }

    //Find all users
    @Query(() => [User], {
        name: "users",
        description: "Retrieve all users"
    })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getAllUsers() {
        return this.usersService.getAllUsers()
    }

    //Find user by email
    @Query(() => User, {
        name: 'userByEmail',
        description: 'Retrieve a user by email',
    })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getUserByEmail(
        @Args("email", { type: () => String }) email: string
    ) {
        const user = await this.usersService.findUserByEmail(email)

        if (!user) {
            throw new NotFoundException("User not found")
        }
        return user
    }

    @Query(() => User, {
        name: 'userById',
        description: 'Retrieve a user by ID',
    })
    @UseGuards(GqlAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getUserById(
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
    ): Promise<User> {
        const user = await this.usersService.findUserById(id);

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }
}