import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import {
  ConfigModule,
  type ConfigType,
} from '@nestjs/config';

import { GraphQLModule } from '@nestjs/graphql';

import {
  ApolloDriver,
  type ApolloDriverConfig,
} from '@nestjs/apollo';

import type { Request, Response } from 'express';

// Application
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

// Configurations
import appConfig from './config/app.config.js';
import graphqlConfig from './config/graphql.config.js';
import databaseConfig from './config/database.config.js';
import jwtConfig from './config/jwt.config.js';
import cookieConfig from './config/cookie.config.js';

import { validateEnv } from './config/env.validation.js';

// Global error handling
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { formatGraphQLError } from './common/formatters/graphql-error.formatter.js';

// Database
import { DatabaseModule } from './database/database.module.js';

// Feature modules
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AdminUsersModule } from './modules/admin/users/admin-users.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { CurriculumModule } from './modules/curriculum/curriculum.module.js';
import { CommerceModule } from './modules/commerce/commerce.module.js';
import { WebsiteModule } from './modules/website/website.module.js';
import { CourseReviewsModule } from './modules/course-reviews/course-reviews.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { InstructorModule } from './modules/instructor/instructor.module.js';

@Module({
  imports: [
    // Global application configuration
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,

      load: [
        appConfig,
        databaseConfig,
        graphqlConfig,
        jwtConfig,
        cookieConfig,
      ],

      validate: validateEnv,
    }),

    // GraphQL configuration
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,

      inject: [graphqlConfig.KEY],

      useFactory: (
        config: ConfigType<typeof graphqlConfig>,
      ): ApolloDriverConfig => ({
        // GraphQL endpoint
        path: config.path,

        // Generate GraphQL schema in memory
        autoSchemaFile: true,

        sortSchema: true,

        // Provide Express request and response
        context: ({
          req,
          res,
        }: {
          req: Request;
          res: Response;
        }) => ({
          req,
          res,
        }),

        // GraphQL development tools
        introspection: config.introspection,

        playground: false,

        // Security configuration
        csrfPrevention: true,

        includeStacktraceInErrorResponses: false,

        // Global GraphQL error formatting
        formatError: formatGraphQLError,
      }),
    }),

    // Database module
    DatabaseModule,

    // Feature modules
    HealthModule,
    UsersModule,
    AuthModule,
    AdminUsersModule,
    CategoriesModule,
    CoursesModule,
    CurriculumModule,
    CourseReviewsModule,
    WebsiteModule,
    CommerceModule,
    StorageModule,
    InstructorModule,
  ],

  controllers: [
    AppController,
  ],

  providers: [
    AppService,

    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule { }
