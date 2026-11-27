import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationMeta } from '../../common/pagination/pagination-meta.entity.js';
import { MediaPurpose, MediaStatus, MediaVisibility } from '../../generated/prisma/enums.js';

registerEnumType(MediaPurpose, { name: 'MediaPurpose' });
registerEnumType(MediaStatus, { name: 'MediaStatus' });
registerEnumType(MediaVisibility, { name: 'MediaVisibility' });

@InputType()
export class CreateMediaUploadInput {
    @Field(() => ID) @IsUUID() requestId!: string;
    @Field(() => MediaPurpose) @IsEnum(MediaPurpose) purpose!: MediaPurpose;
    @Field(() => String) @IsString() @MaxLength(255) fileName!: string;
    @Field(() => String) @IsString() @MaxLength(120) mimeType!: string;
    @Field(() => Int) @IsInt() @Min(1) @Max(1073741824) sizeBytes!: number;
    @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() courseId?: string;
}

@InputType()
export class CompleteMediaPart {
    @Field(() => Int) @IsInt() @Min(1) @Max(1000) partNumber!: number;
    @Field(() => String) @Matches(/^(?:"[a-f0-9]{32}"|[a-f0-9]{32})$/i) etag!: string;
}

@InputType()
export class SignMediaPartsInput {
    @Field(() => ID) @IsUUID() id!: string;
    @Field(() => [Int]) @IsArray() @ArrayMaxSize(32) @IsInt({ each: true }) @Min(1, { each: true }) partNumbers!: number[];
}

@InputType()
export class AdminMediaFilter {
    @Field(() => MediaPurpose, { nullable: true }) @IsOptional() @IsEnum(MediaPurpose) purpose?: MediaPurpose;
    @Field(() => MediaStatus, { nullable: true }) @IsOptional() @IsEnum(MediaStatus) status?: MediaStatus;
    @Field(() => MediaVisibility, { nullable: true }) @IsOptional() @IsEnum(MediaVisibility) visibility?: MediaVisibility;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(120) search?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @Matches(/^(image|video|document)$/) fileType?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsDateString() from?: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsDateString() to?: string;
}

@ObjectType()
export class MediaUploadOptions {
    @Field(() => Boolean) enabled!: boolean;
    @Field(() => Int) maxBytes!: number;
    @Field(() => [String]) extensions!: string[];
}

@ObjectType()
export class StoredMediaAsset {
    @Field(() => ID) id!: string;
    @Field(() => String) originalFileName!: string;
    @Field(() => String) mimeType!: string;
    @Field(() => Int) sizeBytes!: number;
    @Field(() => MediaPurpose) purpose!: MediaPurpose;
    @Field(() => MediaStatus) status!: MediaStatus;
    @Field(() => MediaVisibility) visibility!: MediaVisibility;
    @Field(() => String, { nullable: true }) publicUrl?: string | null;
    @Field(() => Date) createdAt!: Date;
}

@ObjectType()
export class MediaUploadAuthorization {
    @Field(() => StoredMediaAsset) asset!: StoredMediaAsset;
    @Field(() => String, { nullable: true }) url?: string | null;
    @Field(() => Int, { nullable: true }) partSize?: number | null;
    @Field(() => Date) expiresAt!: Date;
}

@ObjectType()
export class SignedMediaPart {
    @Field(() => Int) partNumber!: number;
    @Field(() => String) url!: string;
}

@ObjectType()
export class MediaReadAccess {
    @Field(() => String) url!: string;
    @Field(() => Date, { nullable: true }) expiresAt!: Date | null;
    @Field(() => [Int], { nullable: true }) availableQualities?: number[];
}

@ObjectType()
export class MediaAttachment {
    @Field(() => String) entityType!: string;
    @Field(() => ID) entityId!: string;
}

@ObjectType()
export class AdminStoredMedia extends StoredMediaAsset {
    @Field(() => String, { nullable: true }) uploader?: string | null;
    @Field(() => ID, { nullable: true }) courseScopeId?: string | null;
    @Field(() => [MediaAttachment]) attachments!: MediaAttachment[];
}

@ObjectType()
export class AdminMediaPage {
    @Field(() => [AdminStoredMedia]) items!: AdminStoredMedia[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class MediaStorageStats {
    @Field(() => Boolean) enabled!: boolean;
    @Field(() => Float) storedBytes!: number;
    @Field(() => Float) publicBytes!: number;
    @Field(() => Float) privateBytes!: number;
    @Field(() => Float) reservedBytes!: number;
    @Field(() => Float) softLimit!: number;
    @Field(() => Float) hardLimit!: number;
    @Field(() => Int) stored!: number;
    @Field(() => Int) images!: number;
    @Field(() => Int) videos!: number;
    @Field(() => Int) documents!: number;
    @Field(() => Int) pending!: number;
    @Field(() => Int) failed!: number;
    @Field(() => Int) unattached!: number;
}
