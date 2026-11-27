import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createPaginationMeta, getPaginationWindow } from '../../common/pagination/pagination.utils.js';
import type { PaginationInput } from '../../common/pagination/pagination.input.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CommerceStore } from './commerce.store.js';
import type {
    CommerceEnrollmentFilter, CommerceFilter, CommerceOrderFilter, CommercePaymentFilter,
    CommercePaymentTotals, CommerceWebhookFilter, StudentCommerceOrderStats, StudentEnrollmentCategory,
} from './commerce.models.js';
import { canResumeCheckout } from './payment-policy.js';
import { enrollmentInclude } from './enrollment.service.js';

const studentInfo = { select: { name: true, email: true } } as const;
const enrollmentReference = { select: { id: true, status: true, source: true } } as const;
const newestFirst = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.PaymentOrderByWithRelationInput[];

function textSearch(value: string) {
    return { contains: value, mode: 'insensitive' } as const;
}

function dateFilter(filter?: CommerceFilter) {
    if (filter?.from && filter.to && filter.to < filter.from) {
        throw new BadRequestException('The end date must be on or after the start date.');
    }
    return filter?.from || filter?.to ? { gte: filter.from, lte: filter.to } : undefined;
}

const direction = (filter?: CommerceFilter) => filter?.oldestFirst ? 'asc' : 'desc';

@Injectable()
export class CommerceReadService {
    constructor(private readonly store: CommerceStore) {}

    async enrollments(pagination: PaginationInput, filter?: CommerceEnrollmentFilter, userId?: string) {
        const { page, limit, skip, take } = getPaginationWindow(pagination);
        const search = filter?.search?.trim();
        const match = search ? textSearch(search) : null;
        const where: Prisma.EnrollmentWhereInput = {
            userId, status: filter?.status, source: filter?.source, enrolledAt: dateFilter(filter),
            ...(filter?.categoryId && { course: { categoryId: filter.categoryId } }),
            ...(match && {
                OR: [
                    { course: { title: match } },
                    ...(!userId ? [{ user: { name: match } }, { user: { email: match } }] : []),
                ],
            }),
        };
        const [items, total] = await this.store.prisma.$transaction([
            this.store.prisma.enrollment.findMany({
                where, skip, take, orderBy: [{ enrolledAt: direction(filter) }, { id: direction(filter) }],
                include: { ...enrollmentInclude, user: userId ? false : studentInfo },
            }),
            this.store.prisma.enrollment.count({ where }),
        ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
        const courses = userId ? await this.courseMetadata(items.map(({ courseId }) => courseId)) : null;
        return {
            items: courses ? items.map((item) => ({ ...item, course: {
                ...item.course,
                ...(courses.get(item.courseId) ?? { sectionCount: 0, lessonCount: 0, durationSeconds: null }),
            } })) : items,
            meta: createPaginationMeta(page, limit, total),
        };
    }

    async enrollment(id: string, userId?: string) {
        const item = await this.store.prisma.enrollment.findUnique({
            where: { id, userId }, include: { ...enrollmentInclude, user: userId ? false : studentInfo },
        });
        if (!item) throw new NotFoundException('Enrollment not found.');
        if (!userId) return item;
        const courses = await this.courseMetadata([item.courseId]);
        return { ...item, course: {
            ...item.course,
            ...(courses.get(item.courseId) ?? { sectionCount: 0, lessonCount: 0, durationSeconds: null }),
        } };
    }

    async orders(pagination: PaginationInput, filter?: CommerceOrderFilter, userId?: string) {
        const { page, limit, skip, take } = getPaginationWindow(pagination);
        const where: Prisma.PurchaseOrderWhereInput = {
            userId, status: filter?.status, createdAt: dateFilter(filter),
            ...this.orderSearch(filter?.search, userId),
        };
        const include = this.orderInclude(userId, false);
        const [items, total] = await this.store.prisma.$transaction([
            this.store.prisma.purchaseOrder.findMany({ where, skip, take, orderBy: [{ createdAt: direction(filter) }, { id: direction(filter) }], include }),
            this.store.prisma.purchaseOrder.count({ where }),
        ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
        return {
            items: userId ? items.map((order) => this.withStudentOrderActions(order)) : items,
            meta: createPaginationMeta(page, limit, total),
        };
    }

    async order(id: string, userId?: string) {
        const item = await this.store.prisma.purchaseOrder.findUnique({ where: { id, userId }, include: this.orderInclude(userId, true) });
        if (!item) throw new NotFoundException('Order not found.');
        return userId ? this.withStudentOrderActions(item) : item;
    }

    async payments(pagination: PaginationInput, filter?: CommercePaymentFilter, userId?: string) {
        const { page, limit, skip, take } = getPaginationWindow(pagination);
        const search = filter?.search?.trim();
        const where: Prisma.PaymentWhereInput = {
            order: { userId },
            status: filter?.status, createdAt: dateFilter(filter),
            ...(search && { OR: [
                { order: this.orderSearch(search, userId) },
                ...(!userId ? [{ stripeCheckoutSessionId: textSearch(search) }, { stripePaymentIntentId: textSearch(search) }] : []),
            ] }),
        };
        const [items, total] = await this.store.prisma.$transaction([
            this.store.prisma.payment.findMany({
                where, skip, take, orderBy: [{ createdAt: direction(filter) }, { id: direction(filter) }],
                include: { order: { include: { user: userId ? false : studentInfo, enrollment: enrollmentReference } } },
            }),
            this.store.prisma.payment.count({ where }),
        ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
        return { items, meta: createPaginationMeta(page, limit, total) };
    }

    async payment(id: string, userId?: string) {
        const payment = await this.store.prisma.payment.findFirst({
            where: { id, order: { userId } },
            include: {
                order: { include: { user: userId ? false : studentInfo, enrollment: enrollmentReference } },
                refunds: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
                disputes: userId ? false : { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
            },
        });
        if (!payment) throw new NotFoundException('Payment not found.');
        return payment;
    }

    async webhooks(pagination: PaginationInput, filter?: CommerceWebhookFilter) {
        const { page, limit, skip, take } = getPaginationWindow(pagination);
        const search = filter?.search?.trim();
        const where: Prisma.WebhookEventWhereInput = {
            status: filter?.status, receivedAt: dateFilter(filter),
            ...(search && { OR: [
                { stripeEventId: textSearch(search) }, { stripeObjectId: textSearch(search) }, { eventType: textSearch(search) },
            ] }),
        };
        const [items, total] = await this.store.prisma.$transaction([
            this.store.prisma.webhookEvent.findMany({ where, skip, take, orderBy: [{ receivedAt: direction(filter) }, { id: direction(filter) }] }),
            this.store.prisma.webhookEvent.count({ where }),
        ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
        return { items, meta: createPaginationMeta(page, limit, total) };
    }

    async studentStats(userId: string) {
        const [enrollments, categories, orders, payments] = await Promise.all([
            this.enrollmentStats(userId),
            this.store.prisma.$queryRaw<StudentEnrollmentCategory[]>`
                SELECT DISTINCT category.id, category.name
                FROM "enrollments" enrollment
                JOIN "courses" course ON course.id = enrollment."courseId"
                JOIN "categories" category ON category.id = course."categoryId"
                WHERE enrollment."userId" = ${userId}::uuid
                ORDER BY category.name, category.id
            `,
            this.store.prisma.$queryRaw<StudentCommerceOrderStats[]>`
                SELECT "isTestMode", currency, COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE "paidAt" IS NOT NULL)::int AS paid,
                    COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
                    COALESCE(SUM("totalMinorUnits") FILTER (WHERE "paidAt" IS NOT NULL), 0)::text AS "totalPaidMinorUnits"
                FROM "orders" WHERE "userId" = ${userId}::uuid
                GROUP BY "isTestMode", currency ORDER BY "isTestMode" DESC, currency
            `,
            this.paymentStats(userId),
        ]);
        return { enrollments, categories, orders, payments };
    }

    async enrollmentStats(userId?: string) {
        const rows = await this.store.prisma.enrollment.groupBy({ by: ['status', 'source'], where: { userId }, _count: { _all: true } });
        return rows.reduce((stats, row) => {
            const count = row._count._all;
            stats.total += count;
            if (row.status === 'ACTIVE') stats.active += count;
            if (row.status === 'COMPLETED') stats.completed += count;
            if (row.status === 'REVOKED') stats.revoked += count;
            if (row.source === 'FREE') stats.free += count;
            if (row.source === 'PAID') stats.paid += count;
            return stats;
        }, { total: 0, active: 0, completed: 0, revoked: 0, free: 0, paid: 0 });
    }

    async orderStats() {
        return this.store.prisma.$queryRaw<Array<{ isTestMode: boolean; total: number; paid: number; pending: number }>>`
            SELECT "isTestMode", COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE "paidAt" IS NOT NULL)::int AS paid,
                COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending
            FROM "orders" GROUP BY "isTestMode" ORDER BY "isTestMode" DESC
        `;
    }

    async paymentStats(userId?: string) {
        const owner = userId
            ? Prisma.sql`"orderId" IN (SELECT id FROM "orders" WHERE "userId" = ${userId}::uuid)`
            : Prisma.sql`TRUE`;
        const [counts, totals] = await this.store.prisma.$transaction([
            this.store.prisma.$queryRaw<Array<{ isTestMode: boolean; successful: number; pending: number; failed: number }>>`
                SELECT "isTestMode", COUNT(*) FILTER (WHERE "paidAt" IS NOT NULL)::int AS successful,
                    COUNT(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING'))::int AS pending,
                    COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
                FROM "payments" WHERE ${owner} GROUP BY "isTestMode" ORDER BY "isTestMode" DESC
            `,
            this.store.prisma.$queryRaw<CommercePaymentTotals[]>`
                SELECT "isTestMode", currency, SUM("amountMinorUnits")::text AS "grossMinorUnits",
                    SUM("refundedMinorUnits")::text AS "refundedMinorUnits",
                    (SUM("amountMinorUnits") - SUM("refundedMinorUnits"))::text AS "netMinorUnits"
                FROM "payments" WHERE ${owner} AND "paidAt" IS NOT NULL GROUP BY "isTestMode", currency
                ORDER BY "isTestMode" DESC, currency
            `,
        ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
        return { counts, totals };
    }

    private async courseMetadata(courseIds: string[]) {
        if (!courseIds.length) return new Map<string, { sectionCount: number; lessonCount: number; durationSeconds: number | null }>();
        const ids = Prisma.join(courseIds.map((id) => Prisma.sql`${id}::uuid`));
        const rows = await this.store.prisma.$queryRaw<Array<{
            courseId: string; sectionCount: number; lessonCount: number; durationSeconds: number | null;
        }>>`
            SELECT sections."courseId", COUNT(DISTINCT sections.id)::int AS "sectionCount",
                COUNT(lessons.id)::int AS "lessonCount", SUM(lessons."durationSeconds")::int AS "durationSeconds"
            FROM "course_sections" sections
            LEFT JOIN "course_lessons" lessons ON lessons."sectionId" = sections.id
            WHERE sections."courseId" IN (${ids})
            GROUP BY sections."courseId"
        `;
        return new Map(rows.map(({ courseId, ...metadata }) => [courseId, metadata]));
    }

    private withStudentOrderActions<T extends Prisma.PurchaseOrderGetPayload<{ include: ReturnType<CommerceReadService['orderInclude']> }>>(order: T) {
        const attempt = order.payments[0];
        const course = order.course;
        return {
            ...order,
            reconciliationReason: null,
            paymentStatus: order.successfulPayment?.status ?? attempt?.status ?? null,
            canResume: order.isTestMode && course.status === 'PUBLISHED' && course.pricingType === 'PAID' &&
                !!attempt?.stripeCheckoutSessionId && canResumeCheckout(order.status, attempt),
            course: {
                slug: course.slug,
                thumbnailUrl: course.thumbnailUrl,
                publiclyAvailable: course.status === 'PUBLISHED' && course.category.status === 'ACTIVE' &&
                    course.instructor.role === 'INSTRUCTOR' && course.instructor.status === 'ACTIVE',
                learningAvailable: course.status === 'PUBLISHED' || course.status === 'ARCHIVED',
            },
        };
    }

    private orderSearch(raw: string | undefined, userId?: string): Prisma.PurchaseOrderWhereInput {
        const search = raw?.trim();
        if (!search) return {};
        const match = textSearch(search);
        return { OR: [
            { orderNumber: match }, { courseTitleSnapshot: match },
            ...(!userId ? [{ user: { name: match } }, { user: { email: match } }] : []),
        ] };
    }

    private orderInclude(userId: string | undefined, detailed: boolean) {
        return {
            user: userId ? false : studentInfo,
            payments: {
                orderBy: newestFirst,
                ...(!detailed && { take: 1 }),
                ...(detailed && { include: { refunds: true, disputes: !userId } }),
            },
            enrollment: enrollmentReference,
            successfulPayment: userId ? { select: { status: true } } : false,
            course: { select: {
                slug: true, thumbnailUrl: true, status: true, pricingType: true,
                category: { select: { status: true } },
                instructor: { select: { role: true, status: true } },
            } },
        } satisfies Prisma.PurchaseOrderInclude;
    }
}
