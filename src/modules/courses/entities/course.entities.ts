import {
    Field,
    ID,
    Int,
    ObjectType,
    GraphQLISODateTime,
    registerEnumType,
} from '@nestjs/graphql';

import {
    CourseLevel,
    CoursePricingType,
    CourseStatus,
} from '../../../generated/prisma/enums.js';
import { PaginationMeta } from '../../../common/pagination/pagination-meta.entity.js';
import { MutationResponse } from '../../../common/responses/mutation.response.js';

registerEnumType(CourseLevel, { name: 'CourseLevel' });
registerEnumType(CoursePricingType, { name: 'CoursePricingType' });
registerEnumType(CourseStatus, { name: 'CourseStatus' });

@ObjectType()
export class CourseCategorySummary {
    @Field(() => ID) id!: string;
    @Field(() => String) name!: string;
    @Field(() => String) slug!: string;
}

@ObjectType()
export class CourseInstructorSummary {
    @Field(() => ID) id!: string;
    @Field(() => String) name!: string;
    @Field(() => String, { nullable: true }) avatar!: string | null;
}

@ObjectType()
export class CoursePricing {
    @Field(() => CoursePricingType) type!: CoursePricingType;
    @Field(() => String) currency!: string;
    @Field(() => Int) priceMinorUnits!: number;
    @Field(() => Int, { nullable: true }) discountedPriceMinorUnits!: number | null;
}

@ObjectType()
export class AdminCourse {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => String) slug!: string;
    @Field(() => String) shortDescription!: string;
    @Field(() => String) description!: string;
    @Field(() => String, { nullable: true }) thumbnailUrl!: string | null;
    @Field(() => String, { nullable: true }) promotionalVideoUrl!: string | null;
    @Field(() => CourseCategorySummary) category!: CourseCategorySummary;
    @Field(() => CourseInstructorSummary) instructor!: CourseInstructorSummary;
    @Field(() => CourseLevel) level!: CourseLevel;
    @Field(() => String) language!: string;
    @Field(() => CoursePricing) pricing!: CoursePricing;
    @Field(() => [String]) learningOutcomes!: string[];
    @Field(() => [String]) requirements!: string[];
    @Field(() => [String]) targetAudience!: string[];
    @Field(() => CourseStatus) status!: CourseStatus;
    @Field(() => Boolean) isFeatured!: boolean;
    @Field(() => Boolean, { nullable: true }) canDelete?: boolean;
    @Field(() => Int) sectionCount!: number;
    @Field(() => Int) lessonCount!: number;
    @Field(() => GraphQLISODateTime, { nullable: true }) submittedAt!: Date | null;
    @Field(() => GraphQLISODateTime, { nullable: true }) approvedAt!: Date | null;
    @Field(() => GraphQLISODateTime, { nullable: true }) publishedAt!: Date | null;
    @Field(() => GraphQLISODateTime, { nullable: true }) archivedAt!: Date | null;
    @Field(() => GraphQLISODateTime) createdAt!: Date;
    @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class PublicCourseLesson {
    @Field(() => String) title!: string;
    @Field(() => Int, { nullable: true }) durationSeconds!: number | null;
    @Field(() => Boolean) isPreview!: boolean;
    @Field(() => ID, { nullable: true }) previewLessonId?: string | null;
    @Field(() => Int) resourceCount!: number;
}

@ObjectType()
export class PublicCourseSection {
    @Field(() => String) title!: string;
    @Field(() => [PublicCourseLesson]) lessons!: PublicCourseLesson[];
}

@ObjectType()
export class PublicCourse {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => String) slug!: string;
    @Field(() => String) shortDescription!: string;
    @Field(() => String) description!: string;
    @Field(() => String, { nullable: true }) thumbnailUrl!: string | null;
    @Field(() => String, { nullable: true }) promotionalVideoUrl!: string | null;
    @Field(() => CourseCategorySummary) category!: CourseCategorySummary;
    @Field(() => CourseInstructorSummary) instructor!: CourseInstructorSummary;
    @Field(() => CourseLevel) level!: CourseLevel;
    @Field(() => String) language!: string;
    @Field(() => CoursePricing) pricing!: CoursePricing;
    @Field(() => [String]) learningOutcomes!: string[];
    @Field(() => [String]) requirements!: string[];
    @Field(() => [String]) targetAudience!: string[];
    @Field(() => GraphQLISODateTime) updatedAt!: Date;
    @Field(() => [PublicCourseSection], { nullable: true }) curriculum?: PublicCourseSection[];
}

@ObjectType()
export class AdminCoursesResponse {
    @Field(() => [AdminCourse]) items!: AdminCourse[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class PublicCoursesResponse {
    @Field(() => [PublicCourse]) items!: PublicCourse[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class AdminCourseStats {
    @Field(() => Int) totalCourses!: number;
    @Field(() => Int) draftCourses!: number;
    @Field(() => Int) pendingReviewCourses!: number;
    @Field(() => Int) approvedCourses!: number;
    @Field(() => Int) rejectedCourses!: number;
    @Field(() => Int) publishedCourses!: number;
    @Field(() => Int) archivedCourses!: number;
    @Field(() => Int) freeCourses!: number;
    @Field(() => Int) paidCourses!: number;
}

@ObjectType()
export class CourseInstructorOption {
    @Field(() => ID) id!: string;
    @Field(() => String) name!: string;
    @Field(() => String, { nullable: true }) avatar!: string | null;
}

@ObjectType()
export class CourseCategoryOption {
    @Field(() => ID) id!: string;
    @Field(() => String) name!: string;
    @Field(() => String) slug!: string;
}

@ObjectType()
export class AdminCourseMutationResponse extends MutationResponse {
    @Field(() => AdminCourse) course!: AdminCourse;
}
