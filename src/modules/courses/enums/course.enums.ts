import { registerEnumType } from '@nestjs/graphql';

export enum AdminCourseSortField {
    TITLE = 'TITLE',
    PRICE = 'PRICE',
    CREATED_AT = 'CREATED_AT',
    UPDATED_AT = 'UPDATED_AT',
    PUBLISHED_AT = 'PUBLISHED_AT',
}

registerEnumType(AdminCourseSortField, { name: 'AdminCourseSortField' });
