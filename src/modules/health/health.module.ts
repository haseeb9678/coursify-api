import { Module } from '@nestjs/common';
import { HealthService } from './health.service.js';
import { HealthResolver } from './health.resolver.js';
import { HealthController } from './health.controller.js';

@Module({
  providers: [HealthService, HealthResolver],
  controllers: [HealthController]
})
export class HealthModule {}
