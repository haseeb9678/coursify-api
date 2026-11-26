import { Transform } from 'class-transformer';
import { Field, ID, InputType } from '@nestjs/graphql';
import {
    IsEmail,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
    ValidateIf,
} from 'class-validator';

@InputType()
export class AdminUpdateUserInput {
    @Field(() => ID)
    @IsUUID()
    id!: string;

    @Field(() => String, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    name?: string;

    @Field(() => String, { nullable: true })
    @ValidateIf((_input, value: unknown) => value !== undefined)
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string'
            ? value.trim().toLowerCase()
            : value,
    )
    @IsString()
    @IsEmail()
    @MaxLength(255)
    email?: string;

    @Field(() => String, { nullable: true })
    @ValidateIf(
        (_input, value: unknown) =>
            value !== undefined && value !== null,
    )
    @IsString()
    @MaxLength(2048)
    avatar?: string | null;
}
