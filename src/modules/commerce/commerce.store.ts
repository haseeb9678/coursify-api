import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class CommerceStore {
    constructor(readonly prisma: PrismaService) {}

    async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                return await this.prisma.$transaction(work, {
                    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                });
            } catch (error) {
                if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
                    !['P2034', 'P2002'].includes(error.code)) throw error;
                if (attempt === 3) break;
                await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
            }
        }
        throw new ServiceUnavailableException('The checkout record is busy. Try again.');
    }

    async assertStudent(tx: Prisma.TransactionClient, userId: string) {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
        if (user?.role !== 'STUDENT' || user.status !== 'ACTIVE') {
            throw new ForbiddenException('An active student account is required.');
        }
    }

    async publishedCourse(tx: Prisma.TransactionClient, courseId: string) {
        const course = await tx.course.findUnique({
            where: { id: courseId, status: 'PUBLISHED' },
            select: { id: true, title: true, pricingType: true, priceMinorUnits: true, discountedPriceMinorUnits: true, currency: true },
        });
        if (!course) throw new NotFoundException('This course is unavailable for new enrollments.');
        return course;
    }

    async throttle(userId: string): Promise<void> {
        const cutoff = new Date(Date.now() - 60_000);
        const now = new Date();
        const result = await this.prisma.$queryRaw<Array<{ requests: number }>>`
            INSERT INTO "checkout_rate_limits" ("userId", "windowStart", "requests")
            VALUES (${userId}::uuid, ${now}, 1)
            ON CONFLICT ("userId") DO UPDATE SET
                "windowStart" = CASE WHEN "checkout_rate_limits"."windowStart" <= ${cutoff}
                    THEN EXCLUDED."windowStart" ELSE "checkout_rate_limits"."windowStart" END,
                "requests" = CASE WHEN "checkout_rate_limits"."windowStart" <= ${cutoff}
                    THEN 1 ELSE "checkout_rate_limits"."requests" + 1 END
            WHERE "checkout_rate_limits"."windowStart" <= ${cutoff} OR "checkout_rate_limits"."requests" < 20
            RETURNING "requests"
        `;
        if (!result.length) throw new HttpException('Too many checkout requests. Wait a minute and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
}
