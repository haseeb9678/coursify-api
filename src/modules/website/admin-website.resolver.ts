import { ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import { MutationResponse } from '../../common/responses/mutation.response.js';
import { WebsiteContentStatus } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { WebsiteService } from './website.service.js';
import {
    AdminHeroPage, AdminHeroSlide, AdminPopup, AdminPopupPage, HeroMove, HeroSettingsEntity,
    HeroSettingsInput, HeroSlideInput, PopupInput, WebsiteFilter, WebsiteStats,
} from './website.types.js';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminWebsiteResolver {
    constructor(private readonly service: WebsiteService) {}

    @Query(() => AdminHeroPage)
    adminHeroSlides(@Args('pagination') pagination: PaginationInput, @Args('filter', { type: () => WebsiteFilter, nullable: true }) filter?: WebsiteFilter) {
        return this.service.listHero(pagination, filter);
    }

    @Query(() => AdminHeroSlide)
    adminHeroSlide(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.getSlide(id);
    }

    @Query(() => WebsiteStats)
    adminHeroSlideStats() {
        return this.service.stats('hero');
    }

    @Mutation(() => AdminHeroSlide)
    adminCreateHeroSlide(@Args('input') input: HeroSlideInput, @CurrentUser() actor: AuthenticatedUser) {
        return this.service.saveSlide(input, actor.userId);
    }

    @Mutation(() => AdminHeroSlide)
    adminUpdateHeroSlide(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string, @Args('input') input: HeroSlideInput, @CurrentUser() actor: AuthenticatedUser) {
        return this.service.saveSlide(input, actor.userId, id);
    }

    @Mutation(() => AdminHeroSlide)
    adminUpdateHeroSlideStatus(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string, @Args('status', { type: () => WebsiteContentStatus }) status: WebsiteContentStatus, @CurrentUser() actor: AuthenticatedUser) {
        return this.service.setSlideStatus(id, status, actor.userId);
    }

    @Mutation(() => MutationResponse)
    adminDeleteHeroSlide(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.deleteSlide(id);
    }

    @Query(() => AdminPopupPage)
    adminPromotionalPopups(@Args('pagination') pagination: PaginationInput, @Args('filter', { type: () => WebsiteFilter, nullable: true }) filter?: WebsiteFilter) {
        return this.service.listPopups(pagination, filter);
    }

    @Query(() => AdminPopup)
    adminPromotionalPopup(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.getPopup(id);
    }

    @Query(() => WebsiteStats)
    adminPromotionalPopupStats() {
        return this.service.stats('popup');
    }

    @Mutation(() => AdminPopup)
    adminCreatePromotionalPopup(@Args('input') input: PopupInput, @CurrentUser() actor: AuthenticatedUser) {
        return this.service.savePopup(input, actor.userId);
    }

    @Mutation(() => AdminPopup)
    adminUpdatePromotionalPopup(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string, @Args('input') input: PopupInput, @CurrentUser() actor: AuthenticatedUser) {
        return this.service.savePopup(input, actor.userId, id);
    }

    @Mutation(() => AdminPopup)
    adminUpdatePromotionalPopupStatus(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string, @Args('status', { type: () => WebsiteContentStatus }) status: WebsiteContentStatus, @CurrentUser() actor: AuthenticatedUser) {
        return this.service.setPopupStatus(id, status, actor.userId);
    }

    @Mutation(() => MutationResponse)
    adminDeletePromotionalPopup(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.service.deletePopup(id);
    }

    @Query(() => HeroSettingsEntity)
    adminHeroSettings() {
        return this.service.heroSettings();
    }

    @Mutation(() => HeroSettingsEntity)
    adminUpdateHeroSettings(@Args('input') input: HeroSettingsInput, @CurrentUser() actor: AuthenticatedUser) {
        return this.service.updateSettings(input, actor.userId);
    }

    @Mutation(() => AdminHeroSlide)
    adminMoveHeroSlide(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string, @Args('direction', { type: () => HeroMove }) direction: HeroMove, @CurrentUser() actor: AuthenticatedUser) {
        return this.service.moveSlide(id, direction, actor.userId);
    }
}
