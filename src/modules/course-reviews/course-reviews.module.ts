import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../common/authorization.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminCourseReviewsResolver } from './admin-course-reviews.resolver.js';
import { CourseReviewsService } from './course-reviews.service.js';

@Module({
    imports: [AuthorizationModule, AuthModule, DatabaseModule],
    providers: [CourseReviewsService, AdminCourseReviewsResolver],
})
export class CourseReviewsModule {}
