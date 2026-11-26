import { Field, ObjectType } from '@nestjs/graphql';

import { User } from '../../users/entities/user.entity.js';

import { MutationResponse } from '../../../common/responses/mutation.response.js';

@ObjectType()
export class AuthResponse extends MutationResponse {
    @Field(() => User)
    user!: User;
}