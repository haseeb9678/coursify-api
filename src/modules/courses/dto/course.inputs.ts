import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

import {
    CourseLevel,
    CoursePricingType,
    CourseStatus,
} from '../../../generated/prisma/enums.js';
import { SortDirection } from '../../../common/enums/sort-direction.enum.js';
import { AdminCourseSortField } from '../enums/course.enums.js';

@InputType()
export class AdminCoursesFilterInput {
    @Field(() => String, { nullable: true })
    @IsOptional() @IsString() @MaxLength(100) search?: string;
    @Field(() => ID, { nullable: true })
    @IsOptional() @IsUUID() categoryId?: string;
    @Field(() => ID, { nullable: true })
    @IsOptional() @IsUUID() instructorId?: string;
    @Field(() => CourseStatus, { nullable: true })
    @IsOptional() @IsEnum(CourseStatus) status?: CourseStatus;
    @Field(() => CourseLevel, { nullable: true })
    @IsOptional() @IsEnum(CourseLevel) level?: CourseLevel;
    @Field(() => String, { nullable: true })
    @IsOptional() @IsString() @MaxLength(100) language?: string;
    @Field(() => CoursePricingType, { nullable: true })
    @IsOptional() @IsEnum(CoursePricingType) pricingType?: CoursePricingType;
    @Field(() => Boolean, { nullable: true })
    @IsOptional() @IsBoolean() isFeatured?: boolean;
    @Field(() => Int, { nullable: true })
    @IsOptional() @IsInt() @Min(0) @Max(100000000) minPriceMinorUnits?: number;
    @Field(() => Int, { nullable: true })
    @IsOptional() @IsInt() @Min(0) @Max(100000000) maxPriceMinorUnits?: number;
}

@InputType()
export class AdminCourseSortInput {
    @Field(() => AdminCourseSortField, { defaultValue: AdminCourseSortField.CREATED_AT })
    @IsEnum(AdminCourseSortField) field: AdminCourseSortField = AdminCourseSortField.CREATED_AT;
    @Field(() => SortDirection, { defaultValue: SortDirection.DESC })
    @IsEnum(SortDirection) direction: SortDirection = SortDirection.DESC;
}

@InputType()
export class AdminCreateCourseInput {
    @Field(() => String) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
    @IsString() @MinLength(2) @MaxLength(180) title!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(200) slug?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(500) shortDescription?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(10000) description?: string;
    @Field(() => ID) @IsUUID() categoryId!: string;
    @Field(() => ID) @IsUUID() instructorId!: string;
    @Field(() => CourseLevel, { nullable: true }) @IsOptional() @IsEnum(CourseLevel) level?: CourseLevel;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(100) language?: string;
    @Field(() => CoursePricingType) @IsEnum(CoursePricingType) pricingType!: CoursePricingType;
    @Field(() => Int) @IsInt() @Min(0) @Max(100000000) priceMinorUnits!: number;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(100000000) discountedPriceMinorUnits?: number;
    @Field(() => String, { nullable: true }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) thumbnailUrl?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) promotionalVideoUrl?: string;
    @Field(() => [String], { nullable: true }) @IsOptional() @IsArray() @ArrayMaxSize(50) @MaxLength(300, { each: true }) learningOutcomes?: string[];
    @Field(() => [String], { nullable: true }) @IsOptional() @IsArray() @ArrayMaxSize(50) @MaxLength(300, { each: true }) requirements?: string[];
    @Field(() => [String], { nullable: true }) @IsOptional() @IsArray() @ArrayMaxSize(50) @MaxLength(300, { each: true }) targetAudience?: string[];
}

@InputType()
export class AdminUpdateCourseInput {
    @Field(() => ID) @IsUUID() id!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(2) @MaxLength(180) title?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(200) slug?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(500) shortDescription?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(10000) description?: string;
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() categoryId?: string;
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() instructorId?: string;
    @Field(() => CourseLevel, { nullable: true }) @IsOptional() @IsEnum(CourseLevel) level?: CourseLevel;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(100) language?: string;
    @Field(() => CoursePricingType, { nullable: true }) @IsOptional() @IsEnum(CoursePricingType) pricingType?: CoursePricingType;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(100000000) priceMinorUnits?: number;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(100000000) discountedPriceMinorUnits?: number | null;
    @Field(() => String, { nullable: true }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) thumbnailUrl?: string | null;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) promotionalVideoUrl?: string | null;
    @Field(() => [String], { nullable: true }) @IsOptional() @IsArray() @ArrayMaxSize(50) @MaxLength(300, { each: true }) learningOutcomes?: string[];
    @Field(() => [String], { nullable: true }) @IsOptional() @IsArray() @ArrayMaxSize(50) @MaxLength(300, { each: true }) requirements?: string[];
    @Field(() => [String], { nullable: true }) @IsOptional() @IsArray() @ArrayMaxSize(50) @MaxLength(300, { each: true }) targetAudience?: string[];
}

@InputType()
export class AdminUpdateCourseFeaturedInput {
    @Field(() => ID) @IsUUID() id!: string;
    @Field(() => Boolean) @IsBoolean() isFeatured!: boolean;
}
