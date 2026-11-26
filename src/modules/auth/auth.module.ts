import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersModule } from '../users/users.module.js';

import { AuthService } from './auth.service.js';
import { AuthResolver } from './auth.resolver.js';

import { TokenService } from './services/token.service.js';
import { SessionService } from './services/session.service.js';
import { CookieService } from './services/cookie.service.js';

import { JwtStrategy } from './strategies/jwt.strategy.js';

import { GqlAuthGuard } from '../../common/guards/gql-auth.guard.js';

@Module({
  imports: [
    UsersModule,

    JwtModule.register({}),

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
  ],

  providers: [
    AuthService,
    AuthResolver,

    TokenService,
    SessionService,
    CookieService,

    JwtStrategy,
    GqlAuthGuard,
  ],

  exports: [
    AuthService,
    GqlAuthGuard,
  ],
})
export class AuthModule { }