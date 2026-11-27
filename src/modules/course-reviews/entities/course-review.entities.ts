import {
    Field,
    ID,
    Int,
    ObjectType,
    GraphQLISODateTime,
    registerEnumType,
} from '@nestjs/graphql';

import { CourseReviewDecision, CourseStatus } from '../../../generated/prisma/enums.js';
import { PaginationMeta } from '../../../common/pagination/pagination-meta.entity.js';
import { MutationResponse } from '../../../common/responses/mutation.response.js';
import { AdminCourse } from '../../courses/entities/course.entities.js';

registerEnumType(CourseReviewDecision, { name: 'CourseReviewDecision' });

@ObjectType()
export class CourseReviewerSummary {
    @Field(() => ID) id!: string;
    @Field(() => String) name!: string;
}

@ObjectType()
export class CourseReviewEntity {
    @Field(() => ID) id!: string;
    @Field(() => ID) courseId!: string;
    @Field(() => CourseReviewerSummary) reviewer!: CourseReviewerSummary;
    @Field(() => CourseReviewDecision) decision!: CourseReviewDecision;
    @Field(() => String) feedback!: string;
    @Field(() => CourseStatus) previousStatus!: CourseStatus;
    @Field(() => CourseStatus) newStatus!: CourseStatus;
    @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType()
export class AdminCourseApprovalsResponse {
    @Field(() => [AdminCourse]) items!: AdminCourse[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class AdminCourseApprovalStats {
    @Field(() => Int) pendingReviews!: number;
    @Field(() => Int) approvedCourses!: number;
    @Field(() => Int) rejectedCourses!: number;
    @Field(() => Int) reviewedThisMonth!: number;
}

@ObjectType()
export class AdminCourseApprovalDetails {
    @Field(() => AdminCourse) course!: AdminCourse;
    @Field(() => [String]) readinessErrors!: string[];
    @Field(() => [CourseReviewEntity]) recentReviews!: CourseReviewEntity[];
}

@ObjectType()
export class AdminCourseReviewHistoryResponse {
    @Field(() => [CourseReviewEntity]) items!: CourseReviewEntity[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class CourseApprovalMutationResponse extends MutationResponse {
    @Field(() => AdminCourse) course!: AdminCourse;
}
