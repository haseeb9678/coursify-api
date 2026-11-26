import { Transform } from 'class-transformer';
import { Field, InputType } from '@nestjs/graphql';
import {
    IsEmail,
    IsEnum,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

import {
    UserRole,
    UserStatus,
} from '../../../../generated/prisma/enums.js';

@InputType()
export class AdminCreateUserInput {
    @Field(() => String)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    name!: string;

    @Field(() => String)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string'
            ? value.trim().toLowerCase()
            : value,
    )
    @IsString()
    @IsEmail()
    @MaxLength(255)
    email!: string;

    @Field(() => String)
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(/[A-Z]/, {
        message: 'Include at least one uppercase letter.',
    })
    @Matches(/[a-z]/, {
        message: 'Include at least one lowercase letter.',
    })
    @Matches(/[0-9]/, {
        message: 'Include at least one number.',
    })
    password!: string;

    @Field(() => UserRole)
    @IsEnum(UserRole)
    role!: UserRole;

    @Field(() => UserStatus, {
        nullable: true,
        defaultValue: UserStatus.ACTIVE,
    })
    @IsEnum(UserStatus)
    status: UserStatus = UserStatus.ACTIVE;
}
