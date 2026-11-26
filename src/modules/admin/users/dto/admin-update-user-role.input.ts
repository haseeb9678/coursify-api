import { Field, ID, InputType } from '@nestjs/graphql';
import {
    IsEnum,
    IsUUID,
} from 'class-validator';

import { UserRole } from '../../../../generated/prisma/enums.js';

@InputType()
export class AdminUpdateUserRoleInput {
    @Field(() => ID)
    @IsUUID()
    userId!: string;

    @Field(() => UserRole)
    @IsEnum(UserRole)
    role!: UserRole;
}
