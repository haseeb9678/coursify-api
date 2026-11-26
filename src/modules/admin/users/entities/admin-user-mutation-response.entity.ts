import { Field, ObjectType } from '@nestjs/graphql';

import { MutationResponse } from '../../../../common/responses/mutation.response.js';
import { User } from '../../../users/entities/user.entity.js';

@ObjectType()
export class AdminUserMutationResponse extends MutationResponse {
    @Field(() => User)
    user!: User;
}
