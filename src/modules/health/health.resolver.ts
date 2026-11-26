import { Query, Resolver } from '@nestjs/graphql';
import { Health } from './entities/health.entity.js';
import { HealthService } from './health.service.js';

@Resolver(() => Health)
export class HealthResolver {
    constructor(private readonly healthService: HealthService) { }

    @Query(() => Health, {
        name: "health",
        description: "Check the application status"
    })
    getHealth() {
        return this.healthService.getHealth()
    }

}
