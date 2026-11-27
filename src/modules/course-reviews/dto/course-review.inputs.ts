import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
    IsArray,
    IsEnum,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
} from 'class-validator';

import { CourseStatus } from '../../../generated/prisma/enums.js';
import { PaginationInput } from '../../../common/pagination/pagination.input.js';

@InputType()
export class AdminRejectCourseInput {
    @Field(() => ID) @IsUUID() courseId!: string;
    @Field(() => String) @IsString() @MinLength(20) @MaxLength(5000) feedback!: string;
}

@InputType()
export class AdminApproveCourseInput {
    @Field(() => ID) @IsUUID() courseId!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(5000) feedback?: string;
}

@InputType()
export class AdminCourseApprovalsFilterInput {
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(100) search?: string;
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() categoryId?: string;
    @Field(() => CourseStatus, { nullable: true }) @IsOptional() @IsEnum(CourseStatus) status?: CourseStatus;
}
