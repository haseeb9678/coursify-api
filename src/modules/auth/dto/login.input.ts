import { Field, InputType } from '@nestjs/graphql';

import {
    IsEmail,
    IsString,
    IsNotEmpty,
    MaxLength,
} from 'class-validator';

import { Transform } from 'class-transformer';

@InputType()
export class LoginInput {
    @Field(() => String)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string'
            ? value.trim().toLowerCase()
            : value,
    )
    @IsEmail()
    @MaxLength(255)
    email!: string;

    @Field(() => String)
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    password!: string;
}