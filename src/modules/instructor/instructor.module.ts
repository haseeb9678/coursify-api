import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { InstructorCoursesResolver } from './instructor-courses.resolver.js';
import { InstructorReportsResolver } from './instructor-reports.resolver.js';
import { InstructorReportsService } from './instructor-reports.service.js';

@Module({
    imports: [AuthorizationModule, DatabaseModule, CoursesModule, CurriculumModule, StorageModule],
    providers: [InstructorCoursesResolver, InstructorReportsResolver, InstructorReportsService],
})
export class InstructorModule {}
