import { createHash } from 'node:crypto';
import { ForbiddenException, Injectable, ParseUUIDPipe, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Args, Context, GqlExecutionContext, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PaginationInput } from '../../common/pagination/pagination.input.js';
import type { GraphQLContext } from '../../common/types/graphql-context.type.js';
import { MediaPurpose } from '../../generated/prisma/enums.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import {
    AdminMediaFilter, AdminMediaPage, CompleteMediaPart, CreateMediaUploadInput, MediaReadAccess,
    MediaStorageStats, MediaUploadAuthorization, MediaUploadOptions, SignedMediaPart, SignMediaPartsInput, StoredMediaAsset,
} from './storage.models.js';
import { StorageAccessService } from './storage-access.service.js';
import { StorageService } from './storage.service.js';

@Injectable()
export class StorageOriginGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext) {
        const { req } = GqlExecutionContext.create(context).getContext<GraphQLContext>();
        if (req.headers.origin !== this.config.getOrThrow<string>('app.frontendUrl')) {
            throw new ForbiddenException('Media changes must be submitted from the configured website.');
        }
        return true;
    }
}

@Resolver()
export class StorageResolver {
    constructor(private readonly storage: StorageService, private readonly access: StorageAccessService) {}

    @Query(() => MediaUploadOptions)
    @UseGuards(GqlAuthGuard)
    mediaUploadOptions(@Args('purpose', { type: () => MediaPurpose }) purpose: MediaPurpose) {
        return this.storage.options(purpose);
    }

    @Mutation(() => MediaUploadAuthorization)
    @UseGuards(GqlAuthGuard, StorageOriginGuard)
    createMediaUpload(@CurrentUser() user: AuthenticatedUser, @Args('input') input: CreateMediaUploadInput) {
        return this.storage.create(user, input);
    }

    @Mutation(() => [SignedMediaPart])
    @UseGuards(GqlAuthGuard, StorageOriginGuard)
    signMultipartUploadParts(@CurrentUser() user: AuthenticatedUser, @Args('input') input: SignMediaPartsInput) {
        return this.storage.signParts(user.userId, input.id, input.partNumbers);
    }

    @Mutation(() => StoredMediaAsset)
    @UseGuards(GqlAuthGuard, StorageOriginGuard)
    completeMediaUpload(
        @CurrentUser() user: AuthenticatedUser,
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
        @Args('parts', { type: () => [CompleteMediaPart], nullable: true }) parts?: CompleteMediaPart[],
    ) {
        return this.storage.complete(user.userId, id, parts);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard, StorageOriginGuard)
    abortMediaUpload(@CurrentUser() user: AuthenticatedUser, @Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.storage.abort(user.userId, id);
    }

    @Query(() => MediaReadAccess)
    @UseGuards(GqlAuthGuard)
    lessonMediaAccess(
        @CurrentUser() user: AuthenticatedUser,
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
        @Args('lessonId', { type: () => ID }, ParseUUIDPipe) lessonId: string,
        @Args('height', { type: () => Int, nullable: true }) height?: number,
    ) {
        return this.access.lesson(user, courseId, lessonId, height);
    }

    @Query(() => MediaReadAccess)
    @UseGuards(GqlAuthGuard)
    lessonResourceAccess(
        @CurrentUser() user: AuthenticatedUser,
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
        @Args('lessonId', { type: () => ID }, ParseUUIDPipe) lessonId: string,
        @Args('resourceId', { type: () => ID }, ParseUUIDPipe) resourceId: string,
    ) {
        return this.access.resource(user, courseId, lessonId, resourceId);
    }

    @Query(() => MediaReadAccess)
    lessonPreviewMediaAccess(
        @Context() { req }: GraphQLContext,
        @Args('courseId', { type: () => ID }, ParseUUIDPipe) courseId: string,
        @Args('lessonId', { type: () => ID }, ParseUUIDPipe) lessonId: string,
        @Args('height', { type: () => Int, nullable: true }) height?: number,
    ) {
        const key = createHash('sha256').update(req.ip ?? req.socket.remoteAddress ?? 'unknown').digest('hex');
        return this.access.preview(key, courseId, lessonId, height);
    }

    @Mutation(() => String, { nullable: true })
    @UseGuards(GqlAuthGuard, StorageOriginGuard)
    updateMyAvatar(
        @CurrentUser() user: AuthenticatedUser,
        @Args('url', { type: () => String, nullable: true }) url?: string,
        @Args('assetId', { type: () => ID, nullable: true }) assetId?: string,
    ) {
        if ((url && url.length > 2048) || (assetId && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(assetId))) {
            throw new ForbiddenException('Invalid avatar reference.');
        }
        return this.access.updateAvatar(user.userId, url, assetId);
    }
}

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminStorageResolver {
    constructor(private readonly storage: StorageService, private readonly access: StorageAccessService) {}

    @Query(() => AdminMediaPage)
    adminMediaAssets(
        @Args('pagination') pagination: PaginationInput,
        @Args('filter', { type: () => AdminMediaFilter, nullable: true }) filter?: AdminMediaFilter,
        @Args('oldestFirst', { type: () => Boolean, defaultValue: false }) oldestFirst = false,
    ) {
        return this.storage.list(pagination, filter, oldestFirst);
    }

    @Query(() => MediaStorageStats)
    adminMediaStorageStats() {
        return this.storage.stats();
    }

    @Query(() => MediaReadAccess)
    adminMediaRead(
        @CurrentUser() user: AuthenticatedUser,
        @Args('id', { type: () => ID }, ParseUUIDPipe) id: string,
    ) {
        return this.access.adminRead(user.userId, id);
    }

    @Mutation(() => Boolean)
    @UseGuards(StorageOriginGuard)
    adminDeleteUnusedMedia(@Args('id', { type: () => ID }, ParseUUIDPipe) id: string) {
        return this.storage.deleteUnused(id);
    }

    @Mutation(() => Int)
    @UseGuards(StorageOriginGuard)
    adminCleanupMedia() {
        return this.storage.cleanup();
    }
}
