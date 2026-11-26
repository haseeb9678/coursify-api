import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Health } from './entities/health.entity.js';

@Injectable()
export class HealthService {
    constructor(private readonly configService: ConfigService) { }

    getHealth(): Health {
        return {
            status: "ok",
            application: this.configService.getOrThrow<string>("app.name"),
            timestamp: new Date().toISOString(),
            uptime: Number(process.uptime().toFixed(2))

        }
    }
}
