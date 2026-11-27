import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../common/authorization.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminCoursesResolver } from './admin-courses.resolver.js';
import { PublicCoursesResolver } from './public-courses.resolver.js';
import { CoursesService } from './courses.service.js';

@Module({
    imports: [AuthorizationModule, AuthModule, DatabaseModule],
    providers: [CoursesService, AdminCoursesResolver, PublicCoursesResolver],
})
export class CoursesModule {}
