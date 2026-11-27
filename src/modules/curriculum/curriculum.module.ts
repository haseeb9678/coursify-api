import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../common/authorization.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminCurriculumResolver } from './admin-curriculum.resolver.js';
import { CurriculumService } from './curriculum.service.js';

@Module({
    imports: [AuthorizationModule, AuthModule, DatabaseModule],
    providers: [CurriculumService, AdminCurriculumResolver],
})
export class CurriculumModule {}
