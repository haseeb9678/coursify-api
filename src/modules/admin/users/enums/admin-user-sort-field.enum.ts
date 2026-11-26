import { registerEnumType } from '@nestjs/graphql';

export enum AdminUserSortField {
    NAME = 'NAME',
    EMAIL = 'EMAIL',
    ROLE = 'ROLE',
    STATUS = 'STATUS',
    CREATED_AT = 'CREATED_AT',
    UPDATED_AT = 'UPDATED_AT',
    LAST_LOGIN_AT = 'LAST_LOGIN_AT',
}

registerEnumType(AdminUserSortField, {
    name: 'AdminUserSortField',
});
