import { Field, ID, InputType, Int, OmitType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
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
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() mediaAssetId?: string;
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
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() mediaAssetId?: string;
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
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() mediaAssetId?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(255) fileName?: string;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1000000000) fileSize?: number;
}

@InputType()
export class AdminUpdateLessonResourceInput {
    @Field(() => ID) @IsUUID() id!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MinLength(2) @MaxLength(180) title?: string;
    @Field(() => LessonResourceType, { nullable: true }) @IsOptional() @IsEnum(LessonResourceType) type?: LessonResourceType;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) url?: string;
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() mediaAssetId?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(255) fileName?: string | null;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(0) @Max(1000000000) fileSize?: number | null;
}

@InputType()
export class AdminReorderLessonResourcesInput {
    @Field(() => ID) @IsUUID() lessonId!: string;
    @Field(() => [ID]) @IsArray() @ArrayMaxSize(500) @IsUUID('4', { each: true }) orderedResourceIds!: string[];
}

@InputType()
export class AdminSaveLessonResourceInput extends OmitType(AdminCreateLessonResourceInput, ['lessonId'] as const) {
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() id?: string;
}

@InputType()
export class LessonVideoQualityInput {
    @Field(() => Int) @IsIn([360, 480, 720, 1080]) height!: number;
    @Field(() => ID) @IsUUID() assetId!: string;
}

@InputType()
export class AdminSaveCourseLessonInput extends AdminCreateCourseLessonInput {
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() id?: string;
    @Field(() => [AdminSaveLessonResourceInput])
    @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => AdminSaveLessonResourceInput)
    resources!: AdminSaveLessonResourceInput[];
    @Field(() => [LessonVideoQualityInput], { nullable: true })
    @IsOptional() @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => LessonVideoQualityInput)
    videoQualities?: LessonVideoQualityInput[];
}

@InputType()
export class InstructorImportResourceInput {
    @Field(() => String) @IsString() @MinLength(2) @MaxLength(180) title!: string;
    @Field(() => String) @IsString() @MaxLength(2048) url!: string;
    @Field(() => LessonResourceType, { defaultValue: 'LINK' }) @IsIn(['LINK']) type = 'LINK' as const;
}

@InputType()
export class InstructorImportLessonInput extends OmitType(AdminCreateCourseLessonInput,
    ['sectionId', 'mediaAssetId', 'videoUrl', 'documentUrl'] as const) {
    @Field(() => [InstructorImportResourceInput], { defaultValue: [] })
    @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => InstructorImportResourceInput)
    resources: InstructorImportResourceInput[] = [];
}

@InputType()
export class InstructorImportModuleInput extends OmitType(AdminCreateCourseSectionInput, ['courseId'] as const) {
    @Field(() => [InstructorImportLessonInput], { defaultValue: [] })
    @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => InstructorImportLessonInput)
    lessons: InstructorImportLessonInput[] = [];
}
