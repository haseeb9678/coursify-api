import {
    Field,
    ID,
    ObjectType,
    GraphQLISODateTime,
    registerEnumType,
} from '@nestjs/graphql';

import {
    UserRole,
    UserStatus,
} from '../../../generated/prisma/enums.js';

registerEnumType(UserRole, {
    name: 'UserRole',
});

registerEnumType(UserStatus, {
    name: 'UserStatus',
});

@ObjectType()
export class User {
    @Field(() => ID)
    id!: string;

    @Field(() => String)
    name!: string;

    @Field(() => String)
    email!: string;

    @Field(() => String, { nullable: true })
    avatar!: string | null;

    @Field(() => UserRole)
    role!: UserRole;

    @Field(() => UserStatus)
    status!: UserStatus;

    @Field(() => Boolean)
    isEmailVerified!: boolean;

    @Field(() => GraphQLISODateTime, { nullable: true })
    lastLoginAt!: Date | null;

    @Field(() => GraphQLISODateTime)
    createdAt!: Date;

    @Field(() => GraphQLISODateTime)
    updatedAt!: Date;
}