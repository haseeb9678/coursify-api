import { Field, GraphQLISODateTime, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ArrayMaxSize, IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { PaginationMeta } from '../../common/pagination/pagination-meta.entity.js';
import { WebsiteContentStatus, HeroImagePosition, PopupLayout, PopupTrigger, PopupFrequency, PopupAudience, PopupPageTarget } from '../../generated/prisma/enums.js';

registerEnumType(WebsiteContentStatus, { name: 'WebsiteContentStatus' });
registerEnumType(HeroImagePosition, { name: 'HeroImagePosition' });
registerEnumType(PopupLayout, { name: 'PopupLayout' });
registerEnumType(PopupTrigger, { name: 'PopupTrigger' });
registerEnumType(PopupFrequency, { name: 'PopupFrequency' });
registerEnumType(PopupAudience, { name: 'PopupAudience' });
registerEnumType(PopupPageTarget, { name: 'PopupPageTarget' });

export enum WebsiteVisibility {
    LIVE = 'LIVE',
    SCHEDULED = 'SCHEDULED',
    EXPIRED = 'EXPIRED',
}
export enum WebsiteSort {
    ORDER = 'ORDER',
    NAME = 'NAME',
    UPDATED = 'UPDATED',
    CREATED = 'CREATED',
}
export enum HeroMove {
    UP = 'UP',
    DOWN = 'DOWN',
}
registerEnumType(WebsiteVisibility, { name: 'WebsiteVisibility' });
registerEnumType(WebsiteSort, { name: 'WebsiteSort' });
registerEnumType(HeroMove, { name: 'HeroMove' });

@InputType()
export class WebsiteFilter {
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(100) search?: string;
    @Field(() => WebsiteContentStatus, { nullable: true }) @IsOptional() @IsEnum(WebsiteContentStatus) status?: WebsiteContentStatus;
    @Field(() => WebsiteVisibility, { nullable: true }) @IsOptional() @IsEnum(WebsiteVisibility) visibility?: WebsiteVisibility;
    @Field(() => WebsiteSort, { nullable: true }) @IsOptional() @IsEnum(WebsiteSort) sort?: WebsiteSort;
    @Field(() => Boolean, { nullable: true }) @IsOptional() @IsBoolean() descending?: boolean;
}

@ObjectType()
export class PublicHeroSlide {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => String) description!: string;
    @Field(() => String, { nullable: true }) imageUrl!: string | null;
    @Field(() => String) imageAlt!: string;
    @Field(() => String) primaryCtaLabel!: string;
    @Field(() => String, { nullable: true }) primaryCtaHref!: string | null;
    @Field(() => String) secondaryCtaLabel!: string;
    @Field(() => String, { nullable: true }) secondaryCtaHref!: string | null;
    @Field(() => GraphQLISODateTime, { nullable: true }) endsAt!: Date | null;
    @Field(() => String) eyebrow!: string;
    @Field(() => String, { nullable: true }) mobileImageUrl!: string | null;
    @Field(() => HeroImagePosition) imagePosition!: HeroImagePosition;
    @Field(() => Int) position!: number;
}

@ObjectType()
export class AdminHeroSlide extends PublicHeroSlide {
    @Field(() => String) internalName!: string;
    @Field(() => WebsiteContentStatus) status!: WebsiteContentStatus;
    @Field(() => GraphQLISODateTime, { nullable: true }) startsAt!: Date | null;
    @Field(() => GraphQLISODateTime) updatedAt!: Date;
    @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType()
export class PublicPopup {
    @Field(() => ID) id!: string;
    @Field(() => String) title!: string;
    @Field(() => String) description!: string;
    @Field(() => String, { nullable: true }) imageUrl!: string | null;
    @Field(() => String) imageAlt!: string;
    @Field(() => String) primaryCtaLabel!: string;
    @Field(() => String, { nullable: true }) primaryCtaHref!: string | null;
    @Field(() => String) secondaryCtaLabel!: string;
    @Field(() => String, { nullable: true }) secondaryCtaHref!: string | null;
    @Field(() => GraphQLISODateTime, { nullable: true }) endsAt!: Date | null;
    @Field(() => PopupLayout) layout!: PopupLayout;
    @Field(() => Int) priority!: number;
    @Field(() => PopupTrigger) triggerType!: PopupTrigger;
    @Field(() => Int) delaySeconds!: number;
    @Field(() => PopupFrequency) displayFrequency!: PopupFrequency;
    @Field(() => Int, { nullable: true }) repeatAfterHours!: number | null;
}

@ObjectType()
export class AdminPopup extends PublicPopup {
    @Field(() => String) internalName!: string;
    @Field(() => WebsiteContentStatus) status!: WebsiteContentStatus;
    @Field(() => GraphQLISODateTime, { nullable: true }) startsAt!: Date | null;
    @Field(() => PopupAudience) audience!: PopupAudience;
    @Field(() => PopupPageTarget) pageTarget!: PopupPageTarget;
    @Field(() => [String]) targetPaths!: string[];
    @Field(() => GraphQLISODateTime) updatedAt!: Date;
    @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType()
export class HeroSettingsEntity {
    @Field(() => Boolean) isEnabled!: boolean;
    @Field(() => Boolean) autoplayEnabled!: boolean;
    @Field(() => Boolean) loopEnabled!: boolean;
    @Field(() => Boolean) showNavigationArrows!: boolean;
    @Field(() => Boolean) showPaginationDots!: boolean;
    @Field(() => Boolean) pauseOnHover!: boolean;
    @Field(() => Boolean) pauseOnFocus!: boolean;
    @Field(() => Int) autoplayDelayMs!: number;
}

@InputType()
export class HeroSlideInput {
    @Field(() => String) @IsString() @MaxLength(100) @MinLength(1) internalName!: string;
    @Field(() => WebsiteContentStatus) @IsEnum(WebsiteContentStatus) status!: WebsiteContentStatus;
    @Field(() => GraphQLISODateTime, { nullable: true }) @IsOptional() @IsDate() startsAt!: Date | null;
    @Field(() => String) @IsString() @MaxLength(110) title!: string;
    @Field(() => String) @IsString() @MaxLength(260) description!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) imageUrl!: string | null;
    @Field(() => String) @IsString() @MaxLength(160) imageAlt!: string;
    @Field(() => String) @IsString() @MaxLength(40) primaryCtaLabel!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) primaryCtaHref!: string | null;
    @Field(() => String) @IsString() @MaxLength(40) secondaryCtaLabel!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) secondaryCtaHref!: string | null;
    @Field(() => GraphQLISODateTime, { nullable: true }) @IsOptional() @IsDate() endsAt!: Date | null;
    @Field(() => String) @IsString() @MaxLength(60) eyebrow!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) mobileImageUrl!: string | null;
    @Field(() => HeroImagePosition) @IsEnum(HeroImagePosition) imagePosition!: HeroImagePosition;
}

@InputType()
export class PopupInput {
    @Field(() => String) @IsString() @MaxLength(100) @MinLength(1) internalName!: string;
    @Field(() => WebsiteContentStatus) @IsEnum(WebsiteContentStatus) status!: WebsiteContentStatus;
    @Field(() => GraphQLISODateTime, { nullable: true }) @IsOptional() @IsDate() startsAt!: Date | null;
    @Field(() => String) @IsString() @MaxLength(110) title!: string;
    @Field(() => String) @IsString() @MaxLength(500) description!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) imageUrl!: string | null;
    @Field(() => String) @IsString() @MaxLength(160) imageAlt!: string;
    @Field(() => String) @IsString() @MaxLength(40) primaryCtaLabel!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) primaryCtaHref!: string | null;
    @Field(() => String) @IsString() @MaxLength(40) secondaryCtaLabel!: string;
    @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) secondaryCtaHref!: string | null;
    @Field(() => GraphQLISODateTime, { nullable: true }) @IsOptional() @IsDate() endsAt!: Date | null;
    @Field(() => PopupLayout) @IsEnum(PopupLayout) layout!: PopupLayout;
    @Field(() => Int) @IsInt() @Min(0) @Max(1000) priority!: number;
    @Field(() => PopupTrigger) @IsEnum(PopupTrigger) triggerType!: PopupTrigger;
    @Field(() => Int) @IsInt() @Min(0) @Max(120) delaySeconds!: number;
    @Field(() => PopupFrequency) @IsEnum(PopupFrequency) displayFrequency!: PopupFrequency;
    @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(8760) repeatAfterHours!: number | null;
    @Field(() => PopupAudience) @IsEnum(PopupAudience) audience!: PopupAudience;
    @Field(() => PopupPageTarget) @IsEnum(PopupPageTarget) pageTarget!: PopupPageTarget;
    @Field(() => [String]) @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(250, { each: true }) targetPaths!: string[];
}

@InputType()
export class HeroSettingsInput {
    @Field(() => Boolean) @IsBoolean() isEnabled!: boolean;
    @Field(() => Boolean) @IsBoolean() autoplayEnabled!: boolean;
    @Field(() => Boolean) @IsBoolean() loopEnabled!: boolean;
    @Field(() => Boolean) @IsBoolean() showNavigationArrows!: boolean;
    @Field(() => Boolean) @IsBoolean() showPaginationDots!: boolean;
    @Field(() => Boolean) @IsBoolean() pauseOnHover!: boolean;
    @Field(() => Boolean) @IsBoolean() pauseOnFocus!: boolean;
    @Field(() => Int) @IsInt() @Min(3000) @Max(15000) autoplayDelayMs!: number;
}

@ObjectType()
export class AdminHeroPage {
    @Field(() => [AdminHeroSlide]) items!: AdminHeroSlide[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class AdminPopupPage {
    @Field(() => [AdminPopup]) items!: AdminPopup[];
    @Field(() => PaginationMeta) meta!: PaginationMeta;
}

@ObjectType()
export class WebsiteStats {
    @Field(() => Int) total!: number;
    @Field(() => Int) live!: number;
    @Field(() => Int) scheduled!: number;
    @Field(() => Int) drafts!: number;
    @Field(() => Int) inactiveOrExpired!: number;
}

@ObjectType()
export class PublicHero {
    @Field(() => HeroSettingsEntity) settings!: HeroSettingsEntity;
    @Field(() => [PublicHeroSlide]) slides!: PublicHeroSlide[];
    @Field(() => GraphQLISODateTime) serverTime!: Date;
}

@ObjectType()
export class PublicPopups {
    @Field(() => [PublicPopup]) campaigns!: PublicPopup[];
    @Field(() => GraphQLISODateTime) serverTime!: Date;
}
