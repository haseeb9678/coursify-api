import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { WebsiteContentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { PaginationInput } from '../../common/pagination/pagination.input.js';
import { createPaginationMeta, getPaginationWindow } from '../../common/pagination/pagination.utils.js';
import { mapPrismaError } from '../../common/utils/prisma-error.util.js';
import { heroData, liveWindow, popupData, PUBLIC_CONTENT_LIMIT, publicPath } from './website-policy.js';
import type { HeroMove, HeroSettingsInput, HeroSlideInput, PopupInput, WebsiteFilter } from './website.types.js';

const defaults: HeroSettingsInput = {
    isEnabled: true,
    autoplayEnabled: true,
    autoplayDelayMs: 6000,
    loopEnabled: true,
    showNavigationArrows: true,
    showPaginationDots: true,
    pauseOnHover: true,
    pauseOnFocus: true,
};

const publicFields = {
    id: true, title: true, description: true, imageUrl: true, imageAlt: true,
    primaryCtaLabel: true, primaryCtaHref: true, secondaryCtaLabel: true, secondaryCtaHref: true,
    endsAt: true,
} as const;

type ContentKind = 'hero' | 'popup';
type ContentWhere = Prisma.HeroSlideWhereInput & Prisma.PromotionalPopupWhereInput;

function filterContent(filter?: WebsiteFilter, heroEnabled = true): ContentWhere {
    const search = filter?.search?.trim();
    const now = new Date();
    const visibility: ContentWhere = filter?.visibility === 'LIVE'
        ? heroEnabled ? liveWindow(now) : { id: { in: [] } }
        : filter?.visibility === 'SCHEDULED'
            ? { status: 'ACTIVE', startsAt: { gt: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
            : filter?.visibility === 'EXPIRED' ? { status: 'ACTIVE', endsAt: { lte: now } } : {};
    return {
        AND: [
            filter?.status ? { status: filter.status } : {},
            search ? { OR: [
                { internalName: { contains: search, mode: 'insensitive' } },
                { title: { contains: search, mode: 'insensitive' } },
            ] } : {},
            visibility,
        ],
    };
}

function orderContent(kind: 'hero', filter?: WebsiteFilter): Prisma.HeroSlideOrderByWithRelationInput[];
function orderContent(kind: 'popup', filter?: WebsiteFilter): Prisma.PromotionalPopupOrderByWithRelationInput[];
function orderContent(kind: ContentKind, filter?: WebsiteFilter) {
    const direction: Prisma.SortOrder = filter?.descending === undefined
        ? filter?.sort === 'UPDATED' || filter?.sort === 'CREATED' || (kind === 'popup' && (!filter?.sort || filter.sort === 'ORDER')) ? 'desc' : 'asc'
        : filter.descending ? 'desc' : 'asc';
    if (filter?.sort === 'NAME') return [{ internalName: direction }, { id: 'asc' as const }];
    if (filter?.sort === 'UPDATED') return [{ updatedAt: direction }, { id: 'asc' as const }];
    if (filter?.sort === 'CREATED') return [{ createdAt: direction }, { id: 'asc' as const }];
    return kind === 'hero'
        ? [{ position: direction }, { id: 'asc' as const }]
        : [{ priority: direction }, { createdAt: 'asc' as const }, { id: 'asc' as const }];
}

@Injectable()
export class WebsiteService {
    constructor(private readonly prisma: PrismaService) {}

    private async write<T>(operation: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        try {
            return await this.prisma.$transaction(operation, { isolationLevel: 'Serializable' });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
                throw new ConflictException('Website content changed during this request. Refresh and try again.');
            }
            throw mapPrismaError(error) ?? error;
        }
    }

    async heroSettings() {
        return await this.prisma.heroSettings.findUnique({ where: { id: 1 } }) ?? defaults;
    }

    updateSettings(input: HeroSettingsInput, actor: string) {
        if (!input.showNavigationArrows && !input.showPaginationDots) {
            throw new BadRequestException('Keep at least one manual navigation control enabled.');
        }
        const data = { ...input, updatedById: actor };
        return this.prisma.heroSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    }

    async listHero(pagination: PaginationInput, filter?: WebsiteFilter) {
        const { page, limit, skip, take } = getPaginationWindow(pagination);
        const where = filterContent(filter, filter?.visibility !== 'LIVE' || (await this.heroSettings()).isEnabled);
        const [items, total] = await this.prisma.$transaction([
            this.prisma.heroSlide.findMany({ where, skip, take, orderBy: orderContent('hero', filter) }),
            this.prisma.heroSlide.count({ where }),
        ]);
        return { items, meta: createPaginationMeta(page, limit, total) };
    }

    async listPopups(pagination: PaginationInput, filter?: WebsiteFilter) {
        const { page, limit, skip, take } = getPaginationWindow(pagination);
        const where = filterContent(filter);
        const [items, total] = await this.prisma.$transaction([
            this.prisma.promotionalPopup.findMany({ where, skip, take, orderBy: orderContent('popup', filter) }),
            this.prisma.promotionalPopup.count({ where }),
        ]);
        return { items, meta: createPaginationMeta(page, limit, total) };
    }

    async stats(kind: ContentKind) {
        const now = new Date();
        const count = (where: ContentWhere = {}) => kind === 'hero'
            ? this.prisma.heroSlide.count({ where })
            : this.prisma.promotionalPopup.count({ where });
        const [total, live, scheduled, drafts, inactiveOrExpired] = await this.prisma.$transaction([
            count(), count(liveWindow(now)),
            count({ status: 'ACTIVE', startsAt: { gt: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }),
            count({ status: 'DRAFT' }),
            count({ OR: [{ status: 'INACTIVE' }, { status: 'ACTIVE', endsAt: { lte: now } }] }),
        ]);
        return { total, live: kind === 'hero' && !(await this.heroSettings()).isEnabled ? 0 : live, scheduled, drafts, inactiveOrExpired };
    }

    async getSlide(id: string, db: Prisma.TransactionClient = this.prisma) {
        const slide = await db.heroSlide.findUnique({ where: { id } });
        if (!slide) throw new NotFoundException('Hero slide not found.');
        return slide;
    }

    async getPopup(id: string, db: Prisma.TransactionClient = this.prisma) {
        const popup = await db.promotionalPopup.findUnique({ where: { id } });
        if (!popup) throw new NotFoundException('Promotional popup not found.');
        return popup;
    }

    saveSlide(input: HeroSlideInput, actor: string, id?: string) {
        const data = heroData(input);
        return this.write(async (db) => {
            if (id) return db.heroSlide.update({ where: { id }, data: { ...data, updatedById: actor } });
            const latest = await db.heroSlide.aggregate({ _max: { position: true } });
            return db.heroSlide.create({
                data: { ...data, position: (latest._max.position ?? 0) + 1, createdById: actor, updatedById: actor },
            });
        });
    }

    savePopup(input: PopupInput, actor: string, id?: string) {
        const data = popupData(input);
        return this.write((db) => id
            ? db.promotionalPopup.update({ where: { id }, data: { ...data, updatedById: actor } })
            : db.promotionalPopup.create({ data: { ...data, createdById: actor, updatedById: actor } }));
    }

    setSlideStatus(id: string, status: WebsiteContentStatus, actor: string) {
        return this.write(async (db) => {
            heroData({ ...await this.getSlide(id, db), status });
            return db.heroSlide.update({ where: { id }, data: { status, updatedById: actor } });
        });
    }

    setPopupStatus(id: string, status: WebsiteContentStatus, actor: string) {
        return this.write(async (db) => {
            popupData({ ...await this.getPopup(id, db), status });
            return db.promotionalPopup.update({ where: { id }, data: { status, updatedById: actor } });
        });
    }

    moveSlide(id: string, direction: HeroMove, actor: string) {
        return this.write(async (db) => {
            const slide = await this.getSlide(id, db);
            const neighbor = await db.heroSlide.findFirst({
                where: { position: direction === 'UP' ? { lt: slide.position } : { gt: slide.position } },
                orderBy: [{ position: direction === 'UP' ? 'desc' : 'asc' }, { id: 'asc' }],
            });
            if (!neighbor) return slide;
            await db.heroSlide.update({ where: { id: neighbor.id }, data: { position: slide.position, updatedById: actor } });
            return db.heroSlide.update({ where: { id }, data: { position: neighbor.position, updatedById: actor } });
        });
    }

    deleteSlide(id: string) {
        return this.write(async (db) => {
            const slide = await db.heroSlide.delete({ where: { id } });
            await db.heroSlide.updateMany({ where: { position: { gt: slide.position } }, data: { position: { decrement: 1 } } });
            return { success: true, message: 'Slide deleted.' };
        });
    }

    deletePopup(id: string) {
        return this.write(async (db) => {
            await db.promotionalPopup.delete({ where: { id } });
            return { success: true, message: 'Popup deleted.' };
        });
    }

    async publicHero() {
        const serverTime = new Date();
        const settings = await this.heroSettings();
        const slides = settings.isEnabled ? await this.prisma.heroSlide.findMany({
            where: liveWindow(serverTime), take: PUBLIC_CONTENT_LIMIT, orderBy: orderContent('hero'),
            select: { ...publicFields, eyebrow: true, mobileImageUrl: true, imagePosition: true, position: true },
        }) : [];
        return { settings, slides, serverTime };
    }

    async publicPopups(path: string, authenticated: boolean) {
        const serverTime = new Date();
        const current = path.length <= 250 && publicPath(path);
        if (!current) return { campaigns: [], serverTime };
        const campaigns = await this.prisma.promotionalPopup.findMany({
            where: {
                ...liveWindow(serverTime),
                audience: { in: ['ALL_VISITORS', authenticated ? 'AUTHENTICATED_USERS' : 'GUESTS_ONLY'] },
                OR: [
                    { pageTarget: 'ALL_PUBLIC_PAGES' },
                    ...(current === '/' ? [{ pageTarget: 'HOMEPAGE_ONLY' as const }] : []),
                    ...(current === '/courses' ? [{ pageTarget: 'COURSE_CATALOG' as const }] : []),
                    { pageTarget: 'SPECIFIC_PATHS', targetPaths: { has: current } },
                ],
            },
            take: PUBLIC_CONTENT_LIMIT,
            orderBy: orderContent('popup'),
            select: {
                ...publicFields, layout: true, priority: true, triggerType: true, delaySeconds: true,
                displayFrequency: true, repeatAfterHours: true,
            },
        });
        return { campaigns, serverTime };
    }
}
