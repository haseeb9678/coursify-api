import {
    Field,
    ID,
    Int,
    ObjectType,
    GraphQLISODateTime,
    registerEnumType,
} from '@nestjs/graphql';

import { LessonResourceType, LessonType } from '../../../generated/prisma/enums.js';
import { MutationResponse } from '../../../common/responses/mutation.response.js';

registerEnumType(LessonType, { name: 'LessonType' });
registerEnumType(LessonResourceType, { name: 'LessonResourceType' });

@ObjectType()
export class LessonResourceEntity {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => LessonResourceType) type!: LessonResourceType;
    @Field(() => String) url!: string;
    @Field(() => ID, { nullable: true }) mediaAssetId?: string | null;
    @Field(() => String, { nullable: true }) fileName!: string | null;
    @Field(() => Int, { nullable: true }) fileSize!: number | null;
    @Field(() => Int) position!: number;
    @Field(() => GraphQLISODateTime) createdAt!: Date;
    @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class LessonVideoQualityEntity {
    @Field(() => Int) height!: number;
    @Field(() => ID) assetId!: string;
}

@ObjectType()
export class CourseLessonEntity {
    @Field(() => ID) id!: string;
    @Field(() => ID) sectionId!: string;
    @Field(() => String) title!: string;
    @Field(() => String) description!: string;
    @Field(() => LessonType) type!: LessonType;
    @Field(() => String) content!: string;
    @Field(() => String, { nullable: true }) videoUrl!: string | null;
    @Field(() => String, { nullable: true }) documentUrl!: string | null;
    @Field(() => ID, { nullable: true }) videoAssetId?: string | null;
    @Field(() => ID, { nullable: true }) documentAssetId?: string | null;
    @Field(() => [LessonVideoQualityEntity], { nullable: true }) videoQualities?: LessonVideoQualityEntity[];
    @Field(() => Int, { nullable: true }) durationSeconds!: number | null;
    @Field(() => Int) position!: number;
    @Field(() => Boolean) isPreview!: boolean;
    @Field(() => [LessonResourceEntity]) resources!: LessonResourceEntity[];
    @Field(() => GraphQLISODateTime) createdAt!: Date;
    @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class CourseSectionEntity {
    @Field(() => ID) id!: string;
    @Field(() => ID) courseId!: string;
    @Field(() => String) title!: string;
    @Field(() => String) description!: string;
    @Field(() => Int) position!: number;
    @Field(() => [CourseLessonEntity]) lessons!: CourseLessonEntity[];
    @Field(() => GraphQLISODateTime) createdAt!: Date;
    @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
export class AdminCourseCurriculum {
    @Field(() => ID) courseId!: string;
    @Field(() => [CourseSectionEntity]) sections!: CourseSectionEntity[];
}

@ObjectType()
export class AdminCourseCurriculumStats {
    @Field(() => Int) totalSections!: number;
    @Field(() => Int) totalLessons!: number;
    @Field(() => Int) totalVideoLessons!: number;
    @Field(() => Int) totalTextLessons!: number;
    @Field(() => Int) totalPdfLessons!: number;
    @Field(() => Int) totalDurationSeconds!: number;
    @Field(() => Int) totalPreviewLessons!: number;
}

@ObjectType()
export class SectionMutationResponse extends MutationResponse {
    @Field(() => CourseSectionEntity) section!: CourseSectionEntity;
}

@ObjectType()
export class LessonMutationResponse extends MutationResponse {
    @Field(() => CourseLessonEntity) lesson!: CourseLessonEntity;
}

@ObjectType()
export class ResourceMutationResponse extends MutationResponse {
    @Field(() => LessonResourceEntity) resource!: LessonResourceEntity;
}
