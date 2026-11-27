import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../common/authorization.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminCategoriesResolver } from './admin-categories.resolver.js';
import { PublicCategoriesResolver } from './public-categories.resolver.js';
import { CategoriesService } from './categories.service.js';

@Module({
    imports: [AuthorizationModule, AuthModule, DatabaseModule],
    providers: [
        CategoriesService,
        AdminCategoriesResolver,
        PublicCategoriesResolver,
    ],
})
export class CategoriesModule {}
