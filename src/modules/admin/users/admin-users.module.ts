import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../../common/authorization.module.js';
import { DatabaseModule } from '../../../database/database.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { AdminUsersResolver } from './admin-users.resolver.js';
import { AdminUsersService } from './admin-users.service.js';

@Module({
    imports: [
        AuthorizationModule,
        AuthModule,
        DatabaseModule,
    ],
    providers: [AdminUsersResolver, AdminUsersService],
})
export class AdminUsersModule {}
