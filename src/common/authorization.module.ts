import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { GqlAuthGuard } from './guards/gql-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
    ],
    providers: [GqlAuthGuard, RolesGuard],
    exports: [GqlAuthGuard, RolesGuard],
})
export class AuthorizationModule { }
