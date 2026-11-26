import { Field, ObjectType } from '@nestjs/graphql';

import { User } from '../../../users/entities/user.entity.js';
import { PaginationMeta } from '../../../../common/pagination/pagination-meta.entity.js';

@ObjectType()
export class AdminUsersResponse {
    @Field(() => [User])
    items!: User[];

    @Field(() => PaginationMeta)
    meta!: PaginationMeta;
}
