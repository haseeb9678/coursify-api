import { Prisma } from '../../generated/prisma/client.js';

import {
    ConflictException,
    NotFoundException,
    BadRequestException,
    ServiceUnavailableException,
    type HttpException,
} from '@nestjs/common';

export function mapPrismaError(
    exception: unknown,
): HttpException | undefined {
    if (
        exception instanceof
        Prisma.PrismaClientKnownRequestError
    ) {
        switch (exception.code) {
            case 'P2002':
                return new ConflictException(
                    'A record with this value already exists',
                );

            case 'P2025':
                return new NotFoundException(
                    'Requested record was not found',
                );

            case 'P2003':
                return new ConflictException(
                    'Operation violates a relationship constraint',
                );

            case 'P2000':
                return new BadRequestException(
                    'Provided value exceeds the allowed length',
                );

            case 'P2024':
                return new ServiceUnavailableException(
                    'Database is temporarily unavailable',
                );
        }
    }

    return undefined;
}