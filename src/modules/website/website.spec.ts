import { GUARDS_METADATA } from '@nestjs/common/constants';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { createRequire } from 'node:module';
import type { PrismaService } from '../../database/prisma.service.js';
import { ROLES_METADATA_KEY } from '../../common/decorators/roles.decorator.js';
import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { AdminWebsiteResolver } from './admin-website.resolver.js';
import { OptionalWebsiteAuthGuard, PublicWebsiteResolver } from './public-website.resolver.js';
import { heroData, popupData, publicPath, safeReference } from './website-policy.js';
import { WebsiteService } from './website.service.js';
import { HeroMove, type HeroSlideInput, type PopupInput } from './website.types.js';

const requireGraphQL = createRequire(import.meta.url);
const { graphql }: typeof import('graphql') = requireGraphQL('graphql');

const hero: HeroSlideInput = {
    internalName: 'Hero', title: 'Learn something new', description: 'See what is available in the catalog.',
    eyebrow: '', imageUrl: '/img/hero.jpg', mobileImageUrl: null, imageAlt: 'Students collaborating',
    imagePosition: 'CENTER', primaryCtaLabel: 'Browse', primaryCtaHref: '/courses',
    secondaryCtaLabel: '', secondaryCtaHref: null, status: 'ACTIVE', startsAt: null, endsAt: null,
};

const popup: PopupInput = {
    internalName: 'Announcement', title: 'New courses', description: 'Explore the latest courses.',
    imageUrl: null, imageAlt: '', primaryCtaLabel: '', primaryCtaHref: null,
    secondaryCtaLabel: '', secondaryCtaHref: null, status: 'ACTIVE', startsAt: null, endsAt: null,
    layout: 'TEXT_ONLY', priority: 20, triggerType: 'AFTER_DELAY', delaySeconds: 30,
    displayFrequency: 'ONCE_PER_DAY', repeatAfterHours: null,
    audience: 'GUESTS_ONLY', pageTarget: 'SPECIFIC_PATHS', targetPaths: ['/courses', '/courses/'],
};

describe('Website publication', () => {
    it('allows incomplete drafts and rejects invalid activation and reversed dates', () => {
        expect(heroData({ ...hero, title: '', status: 'DRAFT' }).status).toBe('DRAFT');
        expect(() => heroData({ ...hero, imageUrl: null })).toThrow('desktop image');
        expect(() => heroData({ ...hero, imageUrl: 'https://cdn.example.com/hero.jpg?X-Amz-Signature=private' }))
            .toThrow('without signed credentials');
        expect(() => heroData({ ...hero, primaryCtaLabel: '' })).toThrow('label and a destination');
        expect(() => popupData({ ...popup, targetPaths: [] })).toThrow('at least one public path');
        expect(() => popupData({ ...popup, displayFrequency: 'CUSTOM_INTERVAL' })).toThrow('repeat interval');
        const startsAt = new Date('2026-11-27T13:00:00Z');
        expect(() => popupData({ ...popup, startsAt, endsAt: startsAt })).toThrow('later than the start');
        expect(popupData(popup)).toMatchObject({ priority: 20, delaySeconds: 30, targetPaths: ['/courses'] });
    });

    it.each([
        'javascript:alert(1)', 'data:text/html,test', '//third-party.test',
        '/\\third-party.test', '/%2fthird-party.test', 'https://user:pass@third-party.test', 'https:///third-party.test',
    ])('rejects the unsafe or malformed reference %s', (value) => {
        expect(() => safeReference(value)).toThrow('valid HTTPS URL');
    });

    it('permits supported references and restricts campaign routes', () => {
        expect(safeReference('/courses?category=design#results')).toBe('/courses?category=design#results');
        expect(safeReference('https://images.example.com/banner.jpg')).toBe('https://images.example.com/banner.jpg');
        expect(publicPath('/courses/some-course/')).toBe('/courses/some-course');
        expect(publicPath('/admin')).toBeNull();
        expect(publicPath('/login')).toBeNull();
    });

    it('filters using server time, a bounded priority list and a verified audience flag', async () => {
        const findPopups = vi.fn().mockResolvedValue([]);
        const findSlides = vi.fn().mockResolvedValue([]);
        const settings = vi.fn().mockResolvedValue({ isEnabled: false });
        const service = new WebsiteService({
            promotionalPopup: { findMany: findPopups },
            heroSlide: { findMany: findSlides },
            heroSettings: { findUnique: settings },
        } as unknown as PrismaService);
        const { serverTime } = await service.publicPopups('/courses', false);
        expect(findPopups).toHaveBeenLastCalledWith(expect.objectContaining({
            take: 30,
            orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
            where: {
                status: 'ACTIVE',
                AND: [
                    { OR: [{ startsAt: null }, { startsAt: { lte: serverTime } }] },
                    { OR: [{ endsAt: null }, { endsAt: { gt: serverTime } }] },
                ],
                audience: { in: ['ALL_VISITORS', 'GUESTS_ONLY'] },
                OR: [
                    { pageTarget: 'ALL_PUBLIC_PAGES' }, { pageTarget: 'COURSE_CATALOG' },
                    { pageTarget: 'SPECIFIC_PATHS', targetPaths: { has: '/courses' } },
                ],
            },
        }));
        await service.publicPopups('/', true);
        expect(findPopups).toHaveBeenLastCalledWith(expect.objectContaining({
            where: expect.objectContaining({ audience: { in: ['ALL_VISITORS', 'AUTHENTICATED_USERS'] } }),
        }));
        await expect(service.publicPopups('/admin/website', true)).resolves.toMatchObject({ campaigns: [] });
        expect(findPopups).toHaveBeenCalledTimes(2);
        await expect(service.publicHero()).resolves.toMatchObject({ slides: [] });
        expect(findSlides).not.toHaveBeenCalled();
        settings.mockResolvedValueOnce({ isEnabled: true });
        await service.publicHero();
        expect(findSlides).toHaveBeenCalledWith(expect.objectContaining({
            take: 30, orderBy: [{ position: 'asc' }, { id: 'asc' }],
        }));
    });

    it('orders a slide against its global neighbor and compacts after deletion in transactions', async () => {
        const item = { id: 'example', position: 3 };
        const db = { heroSlide: {
            findUnique: vi.fn().mockResolvedValue(item),
            findFirst: vi.fn().mockResolvedValue({ id: 'neighbor', position: 2 }),
            update: vi.fn().mockResolvedValue(item),
            delete: vi.fn().mockResolvedValue(item),
            updateMany: vi.fn(),
        } };
        const transaction = vi.fn(async (operation: (tx: typeof db) => Promise<unknown>) => operation(db));
        const service = new WebsiteService({ $transaction: transaction } as unknown as PrismaService);
        await service.moveSlide(item.id, HeroMove.UP, 'editor');
        expect(db.heroSlide.findFirst).toHaveBeenCalledWith({
            where: { position: { lt: 3 } }, orderBy: [{ position: 'desc' }, { id: 'asc' }],
        });
        expect(db.heroSlide.update).toHaveBeenNthCalledWith(1, {
            where: { id: 'neighbor' }, data: { position: 3, updatedById: 'editor' },
        });
        expect(db.heroSlide.update).toHaveBeenNthCalledWith(2, {
            where: { id: 'example' }, data: { position: 2, updatedById: 'editor' },
        });
        await service.deleteSlide(item.id);
        expect(db.heroSlide.updateMany).toHaveBeenCalledWith({
            where: { position: { gt: 3 } }, data: { position: { decrement: 1 } },
        });
        expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    });

    it('persists drafts, changes status, and validates the singleton carousel settings', async () => {
        const createSlide = vi.fn().mockResolvedValue({ id: 'slide' });
        const updateSlide = vi.fn().mockResolvedValue({ id: 'slide' });
        const createPopup = vi.fn().mockResolvedValue({ id: 'popup' });
        const updatePopup = vi.fn().mockResolvedValue({ id: 'popup' });
        const upsert = vi.fn().mockResolvedValue({ id: 1 });
        const db = {
            heroSlide: {
                aggregate: vi.fn().mockResolvedValue({ _max: { position: 3 } }),
                findUnique: vi.fn().mockResolvedValue(hero), create: createSlide, update: updateSlide,
            },
            promotionalPopup: { findUnique: vi.fn().mockResolvedValue(popup), create: createPopup, update: updatePopup },
            heroSettings: { upsert },
        };
        const transaction = vi.fn(async (operation: (tx: typeof db) => Promise<unknown>) => operation(db));
        const service = new WebsiteService({ ...db, $transaction: transaction } as unknown as PrismaService);
        await service.saveSlide({ ...hero, status: 'DRAFT' }, 'actor');
        expect(createSlide).toHaveBeenCalledWith({ data: expect.objectContaining({
            status: 'DRAFT', position: 4, createdById: 'actor', updatedById: 'actor',
        }) });
        await service.setSlideStatus('slide', 'ACTIVE', 'actor');
        expect(updateSlide).toHaveBeenCalledWith({ where: { id: 'slide' }, data: { status: 'ACTIVE', updatedById: 'actor' } });
        await service.savePopup({ ...popup, status: 'DRAFT' }, 'actor');
        expect(createPopup).toHaveBeenCalledWith({ data: expect.objectContaining({
            status: 'DRAFT', targetPaths: ['/courses'], createdById: 'actor',
        }) });
        await service.savePopup({ ...popup, title: 'Updated' }, 'actor', 'popup');
        expect(updatePopup).toHaveBeenCalledWith({
            where: { id: 'popup' }, data: expect.objectContaining({ title: 'Updated', updatedById: 'actor' }),
        });
        const settings = {
            isEnabled: true, autoplayEnabled: false, showPaginationDots: true, autoplayDelayMs: 4000,
            showNavigationArrows: false, pauseOnHover: true, pauseOnFocus: true, loopEnabled: false,
        };
        expect(() => service.updateSettings({ ...settings, showPaginationDots: false }, 'actor')).toThrow('manual navigation');
        await service.updateSettings(settings, 'actor');
        expect(upsert).toHaveBeenCalledWith({
            where: { id: 1 }, create: { id: 1, ...settings, updatedById: 'actor' }, update: { ...settings, updatedById: 'actor' },
        });
    });

    it('registers additive GraphQL operations, hides admin fields, and keeps admin guards', async () => {
        const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
        try {
            await module.init();
            const schema = await module.get(GraphQLSchemaFactory).create([AdminWebsiteResolver, PublicWebsiteResolver]);
            const publicQuery = schema.getQueryType()?.getFields();
            expect(publicQuery?.publicPromotionalPopups.args.map(({ name }) => name)).toEqual(['path']);
            expect(schema.getMutationType()?.getFields().adminMoveHeroSlide).toBeDefined();
            const publicResponse = await graphql({
                schema,
                source: '{ publicHero { slides { internalName createdById } } publicPromotionalPopups(path: "/") { campaigns { internalName audience } } }',
            });
            expect(publicResponse.errors).toHaveLength(4);
            expect(Reflect.getMetadata(GUARDS_METADATA, AdminWebsiteResolver)).toEqual([GqlAuthGuard, RolesGuard]);
            expect(Reflect.getMetadata(ROLES_METADATA_KEY, AdminWebsiteResolver)).toEqual(['ADMIN']);
            expect(Reflect.getMetadata(GUARDS_METADATA, PublicWebsiteResolver.prototype.publicPromotionalPopups))
                .toEqual([OptionalWebsiteAuthGuard]);
        } finally {
            await module.close();
        }
    }, 15000);
});
