import { Field, InputType } from '@nestjs/graphql';

import {
    IsEmail,
    IsString,
    IsNotEmpty,
    MinLength,
    MaxLength,
    Matches,
} from 'class-validator';

import { Transform } from 'class-transformer';

@InputType()
export class RegisterInput {
    @Field(() => String)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @MinLength(2, {
        message: 'Name must be at least 2 characters.',
    })
    @MaxLength(50, {
        message: 'Name cannot exceed 50 characters.',
    })
    name!: string;

    @Field(() => String)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string'
            ? value.trim().toLowerCase()
            : value,
    )
    @IsString()
    @IsNotEmpty({
        message: 'Email address is required.',
    })
    @IsEmail({}, {
        message: 'Please enter a valid email address.',
    })
    @MaxLength(255, {
        message: 'Email cannot exceed 255 characters.',
    })
    email!: string;

    @Field(() => String)
    @IsString()
    @MinLength(8, {
        message: 'Password must be at least 8 characters.',
    })
    @MaxLength(128, {
        message: 'Password cannot exceed 128 characters.',
    })
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
}