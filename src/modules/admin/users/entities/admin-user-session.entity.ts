import {
    Field,
    GraphQLISODateTime,
    ID,
    ObjectType,
} from '@nestjs/graphql';

@ObjectType()
export class AdminUserSession {
    @Field(() => ID)
    id!: string;

    @Field(() => ID)
    userId!: string;

    @Field(() => String, { nullable: true })
    userAgent!: string | null;

    @Field(() => String, { nullable: true })
    ipAddress!: string | null;

    @Field(() => GraphQLISODateTime)
    createdAt!: Date;

    @Field(() => GraphQLISODateTime)
    updatedAt!: Date;

    @Field(() => GraphQLISODateTime)
    expiresAt!: Date;

    @Field(() => GraphQLISODateTime, { nullable: true })
    revokedAt!: Date | null;
}
