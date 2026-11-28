import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PaginationInput } from '../../common/pagination/pagination.input.js';
import { createPaginationMeta, getPaginationWindow } from '../../common/pagination/pagination.utils.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
    InstructorAnalytics, InstructorCoursePerformance, InstructorReportFilter, InstructorSale, InstructorSalesPoint, InstructorSalesTotal, InstructorTrend,
} from './instructor.models.js';

function reportDates(filter: InstructorReportFilter) {
    const gte = filter.from ? new Date(filter.from) : undefined;
    const lt = filter.to ? new Date(filter.to) : undefined;
    if (lt && filter.to?.length === 10) lt.setUTCDate(lt.getUTCDate() + 1);
    if (gte && lt && gte >= lt) throw new BadRequestException('Choose a valid date range');
    return { gte, lt };
}

function reportWindow(days: number) {
    if (![7, 30, 90, 365].includes(days)) throw new BadRequestException('Choose a supported reporting period');
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - days + 1);
    return { start, unit: days > 90 ? 'month' : days > 30 ? 'week' : 'day' };
}

function completionRate(completed: number, eligible: number) {
    return eligible ? (completed / eligible) * 100 : null;
}

@Injectable()
export class InstructorReportsService {
    constructor(private readonly prisma: PrismaService) {}

    private async courseFilter(instructorId: string, id?: string | null) {
        if (id && !await this.prisma.course.findUnique({ where: { id, instructorId }, select: { id: true } })) {
            throw new NotFoundException('Course not found');
        }
        return { instructorId, ...(id ? { id } : {}) };
    }

    async enrollments(instructorId: string, pagination: PaginationInput, filter: InstructorReportFilter = {}, requiredStudent = false) {
        const course = await this.courseFilter(instructorId, filter.courseId);
        const { page, limit, skip, take } = getPaginationWindow(pagination);
        const search = filter.search?.trim();
        const where: Prisma.EnrollmentWhereInput = {
            course, userId: filter.studentId ?? undefined, status: filter.status ?? undefined, enrolledAt: reportDates(filter),
            ...(search ? { OR: [
                { user: { name: { contains: search, mode: 'insensitive' } } },
                { course: { title: { contains: search, mode: 'insensitive' } } },
            ] } : {}),
        };
        const order = filter.oldestFirst ? 'asc' : 'desc';
        const [enrollments, total] = await this.prisma.$transaction([
            this.prisma.enrollment.findMany({
                where, skip, take, orderBy: [{ enrolledAt: order }, { id: order }],
                select: { id: true, userId: true, courseId: true, status: true, enrolledAt: true, completedAt: true,
                    user: { select: { name: true, avatar: true } },
                    course: { select: { title: true, sections: { select: { _count: { select: { lessons: true } } } } } },
                },
            }),
            this.prisma.enrollment.count({ where }),
        ]);
        if (requiredStudent && !total) throw new NotFoundException('Student not found in your courses');
        return {
            items: enrollments.map(({ user, userId, course, ...item }) => ({
                ...item, studentId: userId, studentName: user.name, avatar: user.avatar, courseTitle: course.title,
                lessonCount: course.sections.reduce((sum, entry) => sum + entry._count.lessons, 0),
            })),
            meta: createPaginationMeta(page, limit, total),
        };
    }

    async reviews(instructorId: string, pagination: PaginationInput, filter: InstructorReportFilter = {}) {
        const course = await this.courseFilter(instructorId, filter.courseId);
        const { page, limit, skip, take } = getPaginationWindow(pagination);
        const search = filter.search?.trim();
        const where: Prisma.CourseReviewWhereInput = {
            course, decision: filter.decision ?? undefined, createdAt: reportDates(filter),
            ...(search ? { OR: [
                { feedback: { contains: search, mode: 'insensitive' } },
                { course: { title: { contains: search, mode: 'insensitive' } } },
            ] } : {}),
        };
        const order = filter.oldestFirst ? 'asc' : 'desc';
        const [entries, total] = await this.prisma.$transaction([
            this.prisma.courseReview.findMany({ where, skip, take, orderBy: [{ createdAt: order }, { id: order }],
                select: { id: true, courseId: true, decision: true, feedback: true, createdAt: true, course: { select: { title: true } } },
            }),
            this.prisma.courseReview.count({ where }),
        ]);
        return { items: entries.map(({ course, ...entry }) => ({ ...entry, courseTitle: course.title })),
            meta: createPaginationMeta(page, limit, total) };
    }

    async analytics(instructorId: string, days: number, courseId?: string | null): Promise<InstructorAnalytics> {
        const course = await this.courseFilter(instructorId, courseId);
        const { start, unit } = reportWindow(days);
        const activeSince = reportWindow(30).start;
        const scope = Prisma.sql`c."instructorId" = ${instructorId}::uuid ${courseId ? Prisma.sql`AND c.id = ${courseId}::uuid` : Prisma.empty}`;
        // Completion is per enrollment. Revoked and cancelled enrollments stay in history.
        const [courseStatuses, totals, trend, courses, engagement] = await this.prisma.$transaction([
            this.prisma.course.groupBy({ by: ['status'], where: course, _count: { _all: true } }),
            this.prisma.$queryRaw<{ enrollments: number; students: number; completed: number; eligible: number; activeStudents: number }[]>`
                SELECT COUNT(*) FILTER (WHERE e."enrolledAt" >= ${start})::int AS enrollments,
                    COUNT(DISTINCT e."userId") FILTER (WHERE e."enrolledAt" >= ${start})::int AS students,
                    COUNT(*) FILTER (WHERE e."enrolledAt" >= ${start} AND e.status = 'COMPLETED')::int AS completed,
                    COUNT(*) FILTER (WHERE e."enrolledAt" >= ${start} AND e.status IN ('ACTIVE','COMPLETED'))::int AS eligible,
                    COUNT(DISTINCT e."userId") FILTER (WHERE e."enrolledAt" >= ${activeSince} AND e.status = 'ACTIVE')::int AS "activeStudents"
                FROM enrollments e JOIN courses c ON c.id = e."courseId" WHERE ${scope}`,
            this.prisma.$queryRaw<InstructorTrend[]>`
                WITH activity AS (
                    SELECT e."userId", e."enrolledAt", MIN(e."enrolledAt") OVER (PARTITION BY e."userId") AS first_at,
                        ROW_NUMBER() OVER (PARTITION BY e."userId" ORDER BY e."enrolledAt", e.id) AS sequence
                    FROM enrollments e JOIN courses c ON c.id = e."courseId" WHERE ${scope}
                )
                SELECT TO_CHAR(date_trunc(${unit}::text, "enrolledAt"), 'YYYY-MM-DD') AS period,
                    COUNT(*)::int AS enrollments, COUNT(*) FILTER (WHERE sequence = 1 AND first_at = "enrolledAt")::int AS "newStudents"
                FROM activity WHERE "enrolledAt" >= ${start} GROUP BY 1 ORDER BY 1`,
            this.prisma.$queryRaw<(Omit<InstructorCoursePerformance, 'completionRate'> & { eligible: number })[]>`
                SELECT c.id, c.title, c.status::text, c."thumbnailUrl", c."publishedAt", COUNT(e.id)::int AS enrollments,
                    COUNT(e.id) FILTER (WHERE e.status = 'COMPLETED')::int AS completed,
                    COUNT(e.id) FILTER (WHERE e.status IN ('ACTIVE','COMPLETED'))::int AS eligible
                FROM courses c LEFT JOIN enrollments e ON e."courseId" = c.id AND e."enrolledAt" >= ${start}
                WHERE ${scope} GROUP BY c.id ORDER BY enrollments DESC, c."updatedAt" DESC, c.id LIMIT 8`,
            this.prisma.$queryRaw<{ participants: number }[]>`
                SELECT COUNT(DISTINCT lc."authorId")::int AS participants FROM lesson_comments lc
                JOIN course_lessons l ON l.id = lc."lessonId" JOIN course_sections s ON s.id = l."sectionId"
                JOIN courses c ON c.id = s."courseId"
                JOIN enrollments e ON e."courseId" = c.id AND e."userId" = lc."authorId"
                WHERE ${scope} AND lc."createdAt" >= ${start}`,
        ]);
        const { eligible, ...metrics } = totals[0];
        return {
            ...metrics, completionRate: completionRate(metrics.completed, eligible),
            totalCourses: courseStatuses.reduce((sum, row) => sum + row._count._all, 0),
            courseStatuses: courseStatuses.map((row) => ({ label: row.status, count: row._count._all })),
            trend,
            courses: courses.map(({ eligible: enrolled, ...entry }) =>
                ({ ...entry, completionRate: completionRate(entry.completed, enrolled) })),
            discussionParticipants: engagement[0].participants,
        };
    }

    async sales(instructorId: string, pagination: PaginationInput, days: number, courseId?: string | null) {
        await this.courseFilter(instructorId, courseId);
        const { start, unit } = reportWindow(days);
        const { page, limit, skip, take } = getPaginationWindow(pagination);
        // The order's verified successful payment is the only attempt eligible for reporting.
        const records = Prisma.sql`
            WITH verified AS (
                SELECT o.id, c.title AS "courseTitle", o."orderNumber", o."paidAt", o.currency, o."isTestMode",
                    p."amountMinorUnits"::bigint AS gross, p."refundedMinorUnits"::bigint AS refunded,
                    LEAST(GREATEST(p."amountMinorUnits" - p."refundedMinorUnits", 0), COALESCE((
                        SELECT SUM(d."amountMinorUnits") FROM payment_disputes d
                        WHERE d."paymentId" = p.id AND d.currency = p.currency AND d.status IN ('lost','needs_response','under_review')
                    ), 0))::bigint AS disputed
                FROM orders o JOIN courses c ON c.id = o."courseId"
                JOIN payments p ON p.id = o."successfulPaymentId" AND p."orderId" = o.id
                WHERE c."instructorId" = ${instructorId}::uuid
                    ${courseId ? Prisma.sql`AND c.id = ${courseId}::uuid` : Prisma.empty}
                    AND o.status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED')
                    AND p.status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED')
                    AND p."paidAt" IS NOT NULL AND o."paidAt" >= ${start}
                    AND p.currency = o.currency AND p."isTestMode" = o."isTestMode"
            )`;
        const sums = Prisma.sql`COUNT(*)::int AS orders, SUM(gross)::text AS gross, SUM(refunded)::text AS refunded,
            SUM(disputed)::text AS disputed, SUM(gross - refunded - disputed)::text AS net`;
        const [items, totals, trend, count] = await this.prisma.$transaction([
            this.prisma.$queryRaw<InstructorSale[]>`${records} SELECT id, "courseTitle", "orderNumber", "paidAt", currency, "isTestMode",
                gross::text, refunded::text, disputed::text, (gross - refunded - disputed)::text AS net
                FROM verified ORDER BY "paidAt" DESC, id DESC LIMIT ${take} OFFSET ${skip}`,
            this.prisma.$queryRaw<InstructorSalesTotal[]>`${records} SELECT currency, "isTestMode", ${sums}
                FROM verified GROUP BY currency, "isTestMode" ORDER BY "isTestMode", currency`,
            this.prisma.$queryRaw<InstructorSalesPoint[]>`${records} SELECT TO_CHAR(date_trunc(${unit}::text, "paidAt"), 'YYYY-MM-DD') AS period,
                currency, "isTestMode", ${sums} FROM verified GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
            this.prisma.$queryRaw<{ total: number }[]>`${records} SELECT COUNT(*)::int AS total FROM verified`,
        ]);
        return { items, totals, trend, meta: createPaginationMeta(page, limit, count[0].total) };
    }
}
