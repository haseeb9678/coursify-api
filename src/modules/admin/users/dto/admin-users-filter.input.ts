import { Type } from 'class-transformer';
import { Field, InputType, GraphQLISODateTime } from '@nestjs/graphql';
import {
    IsBoolean,
    IsDate,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

import {
    UserRole,
    UserStatus,
} from '../../../../generated/prisma/enums.js';

@InputType()
export class AdminUsersFilterInput {
    @Field(() => String, { nullable: true })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    search?: string;

    @Field(() => UserRole, { nullable: true })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @Field(() => UserStatus, { nullable: true })
    @IsOptional()
    @IsEnum(UserStatus)
    status?: UserStatus;

    @Field(() => Boolean, { nullable: true })
    @IsOptional()
    @IsBoolean()
    isEmailVerified?: boolean;

    @Field(() => GraphQLISODateTime, { nullable: true })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    createdFrom?: Date;

    @Field(() => GraphQLISODateTime, { nullable: true })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    createdTo?: Date;

    @Field(() => GraphQLISODateTime, { nullable: true })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    lastLoginFrom?: Date;

    @Field(() => GraphQLISODateTime, { nullable: true })
    @IsOptional()
    @Type(() => Date)
    @IsDate()
    lastLoginTo?: Date;
}
