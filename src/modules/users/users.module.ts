import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../common/authorization.module.js';

import { UsersService } from './users.service.js';
import { UsersResolver } from './users.resolver.js';

@Module({
  imports: [AuthorizationModule],
  providers: [UsersService, UsersResolver],
  exports: [
    UsersService,
  ],
})
export class UsersModule { }
