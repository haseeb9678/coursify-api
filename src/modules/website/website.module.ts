import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminWebsiteResolver } from './admin-website.resolver.js';
import { OptionalWebsiteAuthGuard, PublicWebsiteResolver } from './public-website.resolver.js';
import { WebsiteService } from './website.service.js';

@Module({
    imports: [DatabaseModule, AuthorizationModule, AuthModule],
    providers: [WebsiteService, AdminWebsiteResolver, PublicWebsiteResolver, OptionalWebsiteAuthGuard],
})
export class WebsiteModule {}
