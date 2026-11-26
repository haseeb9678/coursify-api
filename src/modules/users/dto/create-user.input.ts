import { Field, InputType } from '@nestjs/graphql';
import {
    IsEmail,
    IsString,
    Length,
    MinLength,
    MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

@InputType()
export class CreateUserInput {
    @Field(() => String)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @Length(2, 100)
    name!: string;

    @Field(() => String)
    @IsEmail()
    @MaxLength(255)
    email!: string;

    @Field(() => String)
    @IsString()
    @MinLength(12)
    @MaxLength(128)
    password!: string;
}