import {
    Injectable,
    Logger,
    type OnModuleInit,
    type OnModuleDestroy,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(
        PrismaService.name,
    );

    constructor(configService: ConfigService) {
        const adapter = new PrismaPg({
            connectionString:
                configService.getOrThrow<string>(
                    'database.url',
                ),

            // Maximum connections per pool
            max: 5,

            // Maximum wait for a database connection
            connectionTimeoutMillis: 15000,

            // Close idle database connections
            idleTimeoutMillis: 10000,
        });

        super({ adapter });
    }

    // Initialize database connection
    async onModuleInit(): Promise<void> {
        await this.$connect();

        this.logger.log(
            'PostgreSQL connection initialized',
        );
    }

    // Close database connections
    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();

        this.logger.log(
            'PostgreSQL connection closed',
        );
    }
}