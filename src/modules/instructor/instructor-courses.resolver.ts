import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, Field, ID, InputType, Mutation, OmitType, Query, Resolver } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import { createMutationResponse, MutationResponse } from '../../common/responses/mutation.response.js';
import { CourseStatus } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CoursesService } from '../courses/courses.service.js';
import { AdminCoursesFilterInput, AdminCourseSortInput, AdminCreateCourseInput, AdminUpdateCourseInput } from '../courses/dto/course.inputs.js';
import { AdminCourse, AdminCourseMutationResponse, AdminCoursesResponse, CourseCategoryOption } from '../courses/entities/course.entities.js';
import { CurriculumService } from '../curriculum/curriculum.service.js';
import {
    AdminCreateCourseLessonInput, AdminCreateCourseSectionInput, AdminCreateLessonResourceInput, AdminMoveCourseLessonInput,
    AdminReorderCourseLessonsInput, AdminReorderCourseSectionsInput, AdminReorderLessonResourcesInput,
    AdminSaveCourseLessonInput, AdminUpdateCourseLessonInput, AdminUpdateCourseSectionInput, AdminUpdateLessonResourceInput,
    InstructorImportModuleInput,
} from '../curriculum/dto/curriculum.inputs.js';
import { AdminCourseCurriculum, LessonMutationResponse, ResourceMutationResponse, SectionMutationResponse } from '../curriculum/entities/curriculum.entities.js';

@InputType()
export class InstructorCreateCourseInput extends OmitType(AdminCreateCourseInput, ['instructorId'] as const) {
    @Field(() => [InstructorImportModuleInput], { nullable: true })
    @IsOptional() @IsArray() @ArrayMaxSize(25) @ValidateNested({ each: true }) @Type(() => InstructorImportModuleInput)
    curriculum?: InstructorImportModuleInput[];
}

@InputType()
export class InstructorUpdateCourseInput extends OmitType(AdminUpdateCourseInput, ['instructorId'] as const) {}

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles('INSTRUCTOR')
export class InstructorCoursesResolver {
    constructor(private readonly courses: CoursesService, private readonly curriculum: CurriculumService) {}

    @Query(() => AdminCoursesResponse)
    instructorCourses(
        @CurrentUser() actor: AuthenticatedUser,
        @Args('pagination', { type: () => PaginationInput, defaultValue: { page: 1, limit: 10 } }) pagination: PaginationInput,
        @Args('filter', { type: () => AdminCoursesFilterInput, nullable: true }) filter?: AdminCoursesFilterInput,
        @Args('sort', { type: () => AdminCourseSortInput, nullable: true }) sort?: AdminCourseSortInput,
    ) {
        return this.courses.findCourses(pagination, filter, sort, actor.userId);
    }

    @Query(() => AdminCourse)
    instructorCourse(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.courses.findCourse(id, actor.userId);
    }

    @Query(() => [String])
    instructorCourseReadiness(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.courses.instructorReadiness(id, actor.userId);
    }

    @Query(() => [CourseCategoryOption])
    instructorCourseCategoryOptions(@Args('search', { type: () => String, nullable: true }) search?: string) {
        return this.courses.getCategoryOptions(search, true);
    }

    @Mutation(() => AdminCourseMutationResponse)
    async instructorCreateCourse(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: InstructorCreateCourseInput) {
        const { curriculum, ...fields } = input;
        const course = await this.courses.createCourse({ ...fields, instructorId: actor.userId }, actor,
            curriculum?.length ? (tx, courseId) => this.curriculum.importDraftCurriculum(tx, courseId, curriculum, actor) : undefined);
        return { success: true, message: 'Course created', course };
    }

    @Mutation(() => AdminCourseMutationResponse)
    async instructorUpdateCourse(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: InstructorUpdateCourseInput) {
        const course = await this.courses.updateCourse(input, actor.userId);
        return { success: true, message: 'Course saved', course };
    }

    @Mutation(() => MutationResponse)
    instructorDeleteCourse(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.courses.deleteCourse(id, actor.userId);
    }

    @Mutation(() => AdminCourseMutationResponse)
    async instructorSubmitCourseForReview(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return { success: true, message: 'Course submitted for review', course: await this.courses.submitCourse(id, actor.userId) };
    }

    @Mutation(() => AdminCourseMutationResponse)
    async instructorWithdrawCourseSubmission(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return { success: true, message: 'Course submission withdrawn', course: await this.courses.withdrawSubmission(id, actor.userId) };
    }

    @Mutation(() => AdminCourseMutationResponse)
    async instructorArchiveCourse(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return { success: true, message: 'Course archived', course: await this.courses.archiveCourse(id, actor.userId) };
    }

    @Mutation(() => AdminCourseMutationResponse)
    async instructorRestoreCourse(
        @CurrentUser() actor: AuthenticatedUser,
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
        @Args('expectedStatus', { type: () => CourseStatus, nullable: true }) expectedStatus?: CourseStatus,
    ) {
        return { success: true, message: 'Course restored to draft', course: await this.courses.restoreCourse(id, expectedStatus ?? undefined, actor.userId) };
    }

    @Query(() => AdminCourseCurriculum)
    instructorCourseCurriculum(@CurrentUser() actor: AuthenticatedUser, @Args('courseId', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.curriculum.getCurriculum(id, actor.userId);
    }

    @Mutation(() => SectionMutationResponse)
    async instructorCreateCourseSection(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminCreateCourseSectionInput) {
        return { success: true, message: 'Module created', section: await this.curriculum.createSection(input, actor) };
    }

    @Mutation(() => SectionMutationResponse)
    async instructorUpdateCourseSection(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminUpdateCourseSectionInput) {
        return { success: true, message: 'Module saved', section: await this.curriculum.updateSection(input, actor.userId) };
    }

    @Mutation(() => MutationResponse)
    instructorDeleteCourseSection(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.curriculum.deleteSection(id, actor.userId);
    }

    @Mutation(() => MutationResponse)
    instructorReorderCourseSections(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminReorderCourseSectionsInput) {
        return this.curriculum.reorderSections(input, actor.userId);
    }

    @Mutation(() => LessonMutationResponse)
    async instructorSaveCourseLesson(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminSaveCourseLessonInput) {
        return { ...createMutationResponse('Lesson saved'), lesson: await this.curriculum.saveLesson(input, actor) };
    }

    @Mutation(() => LessonMutationResponse)
    async instructorCreateCourseLesson(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminCreateCourseLessonInput) {
        return { success: true, message: 'Lesson created', lesson: await this.curriculum.createLesson(input, actor) };
    }

    @Mutation(() => LessonMutationResponse)
    async instructorUpdateCourseLesson(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminUpdateCourseLessonInput) {
        return { success: true, message: 'Lesson updated', lesson: await this.curriculum.updateLesson(input, actor) };
    }

    @Mutation(() => MutationResponse)
    instructorDeleteCourseLesson(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.curriculum.deleteLesson(id, actor.userId);
    }

    @Mutation(() => MutationResponse)
    instructorReorderCourseLessons(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminReorderCourseLessonsInput) {
        return this.curriculum.reorderLessons(input, actor.userId);
    }

    @Mutation(() => MutationResponse)
    instructorMoveCourseLesson(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminMoveCourseLessonInput) {
        return this.curriculum.moveLesson(input, actor.userId);
    }

    @Mutation(() => ResourceMutationResponse)
    async instructorCreateLessonResource(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminCreateLessonResourceInput) {
        return { success: true, message: 'Resource added', resource: await this.curriculum.createResource(input, actor) };
    }

    @Mutation(() => ResourceMutationResponse)
    async instructorUpdateLessonResource(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminUpdateLessonResourceInput) {
        return { success: true, message: 'Resource saved', resource: await this.curriculum.updateResource(input, actor) };
    }

    @Mutation(() => MutationResponse)
    instructorDeleteLessonResource(@CurrentUser() actor: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.curriculum.deleteResource(id, undefined, actor.userId);
    }

    @Mutation(() => MutationResponse)
    instructorReorderLessonResources(@CurrentUser() actor: AuthenticatedUser, @Args('input') input: AdminReorderLessonResourcesInput) {
        return this.curriculum.reorderResources(input, undefined, actor.userId);
    }
}
