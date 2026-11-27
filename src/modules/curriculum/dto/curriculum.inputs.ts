import { Field, ID, InputType, Int } from '@nestjs/graphql';
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

import { LessonResourceType, LessonType } from '../../../generated/prisma/enums.js';

@InputType()
export class AdminCreateCourseSectionInput {
    @Field(() => ID) @IsUUID() courseId!: string;
    @Field(() => String) @IsString() @MinLength(2) @MaxLength(180) title!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

@InputType()
export class AdminUpdateCourseSectionInput {
    @Field(() => ID) @IsUUID() id!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MinLength(2) @MaxLength(180) title?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

@InputType()
export class AdminReorderCourseSectionsInput {
    @Field(() => ID) @IsUUID() courseId!: string;
    @Field(() => [ID]) @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true }) orderedSectionIds!: string[];
}

@InputType()
export class AdminCreateCourseLessonInput {
    @Field(() => ID) @IsUUID() sectionId!: string;
    @Field(() => String) @IsString() @MinLength(2) @MaxLength(180) title!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2000) description?: string;
    @Field(() => LessonType) @IsEnum(LessonType) type!: LessonType;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(10000) content?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) videoUrl?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) documentUrl?: string;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1000000) durationSeconds?: number;
    @Field(() => Boolean, { defaultValue: false }) @IsBoolean() isPreview = false;
}

@InputType()
export class AdminUpdateCourseLessonInput {
    @Field(() => ID) @IsUUID() id!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MinLength(2) @MaxLength(180) title?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2000) description?: string;
    @Field(() => LessonType, { nullable: true }) @IsOptional() @IsEnum(LessonType) type?: LessonType;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(10000) content?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) videoUrl?: string | null;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) documentUrl?: string | null;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1000000) durationSeconds?: number | null;
    @Field(() => Boolean, { nullable: true }) @IsOptional() @IsBoolean() isPreview?: boolean;
}

@InputType()
export class AdminReorderCourseLessonsInput {
    @Field(() => ID) @IsUUID() sectionId!: string;
    @Field(() => [ID]) @IsArray() @ArrayMaxSize(1000) @IsUUID('4', { each: true }) orderedLessonIds!: string[];
}

@InputType()
export class AdminMoveCourseLessonInput {
    @Field(() => ID) @IsUUID() lessonId!: string;
    @Field(() => ID) @IsUUID() destinationSectionId!: string;
}

@InputType()
export class AdminCreateLessonResourceInput {
    @Field(() => ID) @IsUUID() lessonId!: string;
    @Field(() => String) @IsString() @MinLength(2) @MaxLength(180) title!: string;
    @Field(() => LessonResourceType) @IsEnum(LessonResourceType) type!: LessonResourceType;
    @Field(() => String) @IsString() @MaxLength(2048) url!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(255) fileName?: string;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1000000000) fileSize?: number;
}

@InputType()
export class AdminUpdateLessonResourceInput {
    @Field(() => ID) @IsUUID() id!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MinLength(2) @MaxLength(180) title?: string;
    @Field(() => LessonResourceType, { nullable: true }) @IsOptional() @IsEnum(LessonResourceType) type?: LessonResourceType;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) url?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(255) fileName?: string | null;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1000000000) fileSize?: number | null;
}

@InputType()
export class AdminReorderLessonResourcesInput {
    @Field(() => ID) @IsUUID() lessonId!: string;
    @Field(() => [ID]) @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true }) orderedResourceIds!: string[];
}
