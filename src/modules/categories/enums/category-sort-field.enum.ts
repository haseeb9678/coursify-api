import { registerEnumType } from '@nestjs/graphql';

export enum AdminCategorySortField {
    NAME = 'NAME',
    CREATED_AT = 'CREATED_AT',
    UPDATED_AT = 'UPDATED_AT',
    COURSE_COUNT = 'COURSE_COUNT',
}

registerEnumType(AdminCategorySortField, {
    name: 'AdminCategorySortField',
});
