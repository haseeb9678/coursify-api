import { Field, ObjectType } from '@nestjs/graphql';

import { User } from '../entities/user.entity.js';
import { MutationResponse } from '../../../common/responses/mutation.response.js';

@ObjectType()
export class CreateUserResponse extends MutationResponse {
    @Field(() => User)
    user!: User;
}