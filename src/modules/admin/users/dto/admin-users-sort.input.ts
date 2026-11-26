import { Field, InputType } from '@nestjs/graphql';
import { IsEnum, IsOptional } from 'class-validator';

import { SortDirection } from '../../../../common/enums/sort-direction.enum.js';
import { AdminUserSortField } from '../enums/admin-user-sort-field.enum.js';

@InputType()
export class AdminUsersSortInput {
    @Field(() => AdminUserSortField, {
        defaultValue: AdminUserSortField.CREATED_AT,
    })
    @IsOptional()
    @IsEnum(AdminUserSortField)
    field = AdminUserSortField.CREATED_AT;

    @Field(() => SortDirection, {
        defaultValue: SortDirection.DESC,
    })
    @IsOptional()
    @IsEnum(SortDirection)
    direction = SortDirection.DESC;
}
