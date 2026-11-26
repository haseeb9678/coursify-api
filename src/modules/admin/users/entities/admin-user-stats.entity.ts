import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class AdminUserStats {
    @Field(() => Int)
    totalUsers!: number;

    @Field(() => Int)
    activeUsers!: number;

    @Field(() => Int)
    inactiveUsers!: number;

    @Field(() => Int)
    suspendedUsers!: number;

    @Field(() => Int)
    verifiedUsers!: number;

    @Field(() => Int)
    unverifiedUsers!: number;

    @Field(() => Int)
    totalStudents!: number;

    @Field(() => Int)
    totalInstructors!: number;

    @Field(() => Int)
    totalAdmins!: number;

    @Field(() => Int, {
        description: 'Users created since 00:00 UTC on the first of this month.',
    })
    newUsersThisMonth!: number;
}
