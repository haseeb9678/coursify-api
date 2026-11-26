import { Field, ID, InputType } from '@nestjs/graphql';
import {
    IsEnum,
    IsUUID,
} from 'class-validator';

import { UserStatus } from '../../../../generated/prisma/enums.js';

@InputType()
export class AdminUpdateUserStatusInput {
    @Field(() => ID)
    @IsUUID()
    userId!: string;

    @Field(() => UserStatus)
    @IsEnum(UserStatus)
    status!: UserStatus;
}
