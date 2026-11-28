import { Field, Float, ID, InputType, Int, ObjectType } from '@nestjs/graphql';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationMeta } from '../../common/pagination/pagination-meta.entity.js';

@InputType()
export class InstructorReportFilter {
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() courseId?: string;
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() studentId?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(100) search?: string;
    @Field(() => String, { nullable: true }) @IsOptional()
    @IsIn(['ACTIVE', 'COMPLETED', 'REVOKED', 'CANCELLED']) status?: 'ACTIVE' | 'COMPLETED' | 'REVOKED' | 'CANCELLED';
    @Field(() => String, { nullable: true }) @IsOptional()
    @IsIn(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']) decision?: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
    @Field(() => String, { nullable: true }) @IsOptional() @IsDateString() from?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsDateString() to?: string;
    @Field(() => Boolean, { nullable: true }) @IsOptional() oldestFirst?: boolean;
}

@ObjectType()
export class InstructorCount {
    @Field(() => String) label!: string;
    @Field(() => Int) count!: number;
}

@ObjectType()
export class InstructorTrend {
    @Field(() => String) period!: string;
    @Field(() => Int) enrollments!: number;
    @Field(() => Int) newStudents!: number;
}

@ObjectType()
export class InstructorCoursePerformance {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => String) status!: string;
    @Field(() => String, { nullable: true }) thumbnailUrl!: string | null;
    @Field(() => Date, { nullable: true }) publishedAt!: Date | null;
    @Field(() => Int) enrollments!: number;
    @Field(() => Int) completed!: number;
    @Field(() => Float, { nullable: true }) completionRate!: number | null;
}

@ObjectType()
export class InstructorAnalytics {
    @Field(() => [InstructorCount]) courseStatuses!: InstructorCount[];
    @Field(() => Int) totalCourses!: number;
    @Field(() => Int) enrollments!: number;
    @Field(() => Int) students!: number;
    @Field(() => Int) completed!: number;
    @Field(() => Int) activeStudents!: number;
    @Field(() => Int) discussionParticipants!: number;
    @Field(() => Float, { nullable: true }) completionRate!: number | null;
    @Field(() => [InstructorTrend]) trend!: InstructorTrend[];
    @Field(() => [InstructorCoursePerformance]) courses!: InstructorCoursePerformance[];
}

@ObjectType()
export class InstructorEnrollment {
    @Field(() => ID) id!: string;
    @Field(() => ID) studentId!: string;
    @Field(() => String) studentName!: string;
    @Field(() => String, { nullable: true }) avatar!: string | null;
    @Field(() => ID) courseId!: string;
    @Field(() => String) courseTitle!: string;
    @Field(() => Int) lessonCount!: number;
    @Field(() => String) status!: string;
    @Field(() => Date) enrolledAt!: Date;
    @Field(() => Date, { nullable: true }) completedAt!: Date | null;
}

@ObjectType()
export class InstructorEnrollmentPage {
    @Field(() => [InstructorEnrollment]) items!: InstructorEnrollment[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class InstructorReview {
    @Field(() => ID) id!: string;
    @Field(() => ID) courseId!: string;
    @Field(() => String) courseTitle!: string;
    @Field(() => String) decision!: string;
    @Field(() => String) feedback!: string;
    @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class InstructorReviewPage {
    @Field(() => [InstructorReview]) items!: InstructorReview[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class InstructorSale {
    @Field(() => ID) id!: string;
    @Field(() => String) courseTitle!: string;
    @Field(() => String) orderNumber!: string;
    @Field(() => Date) paidAt!: Date;
    @Field(() => String) currency!: string;
    @Field(() => Boolean) isTestMode!: boolean;
    @Field(() => String) gross!: string;
    @Field(() => String) refunded!: string;
    @Field(() => String) disputed!: string;
    @Field(() => String) net!: string;
}

@ObjectType()
export class InstructorSalesTotal {
    @Field(() => String) currency!: string;
    @Field(() => Boolean) isTestMode!: boolean;
    @Field(() => Int) orders!: number;
    @Field(() => String) gross!: string;
    @Field(() => String) refunded!: string;
    @Field(() => String) disputed!: string;
    @Field(() => String) net!: string;
}

@ObjectType()
export class InstructorSalesPoint extends InstructorSalesTotal {
    @Field(() => String) period!: string;
}

@ObjectType()
export class InstructorSalesPage {
    @Field(() => [InstructorSale]) items!: InstructorSale[];
    @Field(() => [InstructorSalesTotal]) totals!: InstructorSalesTotal[];
    @Field(() => [InstructorSalesPoint]) trend!: InstructorSalesPoint[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}
