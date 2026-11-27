import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { MutationResponse, createMutationResponse } from '../../common/responses/mutation.response.js';
import { UserRole } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurriculumService } from './curriculum.service.js';
import {
    AdminCreateCourseLessonInput,
    AdminCreateCourseSectionInput,
    AdminCreateLessonResourceInput,
    AdminMoveCourseLessonInput,
    AdminReorderCourseLessonsInput,
    AdminReorderCourseSectionsInput,
    AdminReorderLessonResourcesInput,
    AdminSaveCourseLessonInput,
    AdminUpdateCourseLessonInput,
    AdminUpdateCourseSectionInput,
    AdminUpdateLessonResourceInput,
} from './dto/curriculum.inputs.js';
import {
    AdminCourseCurriculum,
    AdminCourseCurriculumStats,
    CourseLessonEntity,
    CourseSectionEntity,
    LessonResourceEntity,
    LessonMutationResponse,
    ResourceMutationResponse,
    SectionMutationResponse,
} from './entities/curriculum.entities.js';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCurriculumResolver {
    constructor(private readonly service: CurriculumService) {}

    @Query(() => AdminCourseCurriculum, { name: 'adminCourseCurriculum' })
    adminCourseCurriculum(@Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string) {
        return this.service.getCurriculum(courseId);
    }

    @Query(() => AdminCourseCurriculumStats, { name: 'adminCourseCurriculumStats' })
    adminCourseCurriculumStats(@Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string) {
        return this.service.getStats(courseId);
    }

    @Query(() => CourseSectionEntity, { name: 'adminCourseSection' })
    async adminCourseSection(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        const curriculum = await this.service.getCurriculumBySection(id);
        return curriculum;
    }

    @Query(() => CourseLessonEntity, { name: 'adminCourseLesson' })
    async adminCourseLesson(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.getLesson(id);
    }

    @Mutation(() => SectionMutationResponse, { name: 'adminCreateCourseSection' })
    async adminCreateCourseSection(
        @Args('input') input: AdminCreateCourseSectionInput,
        @CurrentUser() actor: AuthenticatedUser,
    ) {
        const section = await this.service.createSection(input, actor);
        return { ...createMutationResponse('Course section created successfully'), section };
    }

    @Mutation(() => SectionMutationResponse, { name: 'adminUpdateCourseSection' })
    async adminUpdateCourseSection(@Args('input') input: AdminUpdateCourseSectionInput) {
        const section = await this.service.updateSection(input);
        return { ...createMutationResponse('Course section updated successfully'), section };
    }

    @Mutation(() => MutationResponse, { name: 'adminDeleteCourseSection' })
    adminDeleteCourseSection(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.deleteSection(id);
    }

    @Mutation(() => MutationResponse, { name: 'adminReorderCourseSections' })
    adminReorderCourseSections(@Args('input') input: AdminReorderCourseSectionsInput) {
        return this.service.reorderSections(input);
    }

    @Mutation(() => LessonMutationResponse, { name: 'adminCreateCourseLesson' })
    async adminCreateCourseLesson(
        @Args('input') input: AdminCreateCourseLessonInput,
        @CurrentUser() actor: AuthenticatedUser,
    ) {
        const lesson = await this.service.createLesson(input, actor);
        return { ...createMutationResponse('Course lesson created successfully'), lesson };
    }

    @Mutation(() => LessonMutationResponse, { name: 'adminUpdateCourseLesson' })
    async adminUpdateCourseLesson(@Args('input') input: AdminUpdateCourseLessonInput, @CurrentUser() actor: AuthenticatedUser) {
        const lesson = await this.service.updateLesson(input, actor);
        return { ...createMutationResponse('Course lesson updated successfully'), lesson };
    }

    @Mutation(() => LessonMutationResponse)
    async adminSaveCourseLesson(@Args('input') input: AdminSaveCourseLessonInput, @CurrentUser() actor: AuthenticatedUser) {
        const lesson = await this.service.saveLesson(input, actor);
        return { ...createMutationResponse('Course lesson saved successfully'), lesson };
    }

    @Mutation(() => MutationResponse, { name: 'adminDeleteCourseLesson' })
    adminDeleteCourseLesson(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.deleteLesson(id);
    }

    @Mutation(() => MutationResponse, { name: 'adminReorderCourseLessons' })
    adminReorderCourseLessons(@Args('input') input: AdminReorderCourseLessonsInput) {
        return this.service.reorderLessons(input);
    }

    @Mutation(() => MutationResponse, { name: 'adminMoveCourseLesson' })
    adminMoveCourseLesson(@Args('input') input: AdminMoveCourseLessonInput) {
        return this.service.moveLesson(input);
    }

    @Query(() => [LessonResourceEntity], { name: 'adminLessonResources' })
    adminLessonResources(@Args('lessonId', { type: () => ID }, ParseUUIDPipe) lessonId: string) {
        return this.service.findResources(lessonId);
    }

    @Mutation(() => ResourceMutationResponse, { name: 'adminCreateLessonResource' })
    async adminCreateLessonResource(@Args('input') input: AdminCreateLessonResourceInput, @CurrentUser() actor: AuthenticatedUser) {
        const resource = await this.service.createResource(input, actor);
        return { ...createMutationResponse('Lesson resource created successfully'), resource };
    }

    @Mutation(() => ResourceMutationResponse, { name: 'adminUpdateLessonResource' })
    async adminUpdateLessonResource(@Args('input') input: AdminUpdateLessonResourceInput, @CurrentUser() actor: AuthenticatedUser) {
        const resource = await this.service.updateResource(input, actor);
        return { ...createMutationResponse('Lesson resource updated successfully'), resource };
    }

    @Mutation(() => MutationResponse, { name: 'adminDeleteLessonResource' })
    adminDeleteLessonResource(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.deleteResource(id);
    }

    @Mutation(() => MutationResponse, { name: 'adminReorderLessonResources' })
    adminReorderLessonResources(@Args('input') input: AdminReorderLessonResourcesInput) {
        return this.service.reorderResources(input);
    }
}
