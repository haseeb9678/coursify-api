import { Test } from '@nestjs/testing';
import {
    GraphQLModule,
    GraphQLSchemaHost,
} from '@nestjs/graphql';
import {
    ApolloDriver,
    type ApolloDriverConfig,
} from '@nestjs/apollo';

import { AuthorizationModule } from '../../../common/authorization.module.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { SessionService } from '../../auth/services/session.service.js';
import { AdminUsersResolver } from './admin-users.resolver.js';
import { AdminUsersService } from './admin-users.service.js';

describe('Admin Users GraphQL schema', () => {
    it('builds admin operations using safe user fields', async () => {
        const module = await Test.createTestingModule({
            imports: [
                AuthorizationModule,
                GraphQLModule.forRoot<ApolloDriverConfig>({
                    driver: ApolloDriver,
                    autoSchemaFile: true,
                }),
            ],
            providers: [
                AdminUsersResolver,
                AdminUsersService,
                { provide: PrismaService, useValue: {} },
                { provide: SessionService, useValue: {} },
            ],
        }).compile();

        const app = module.createNestApplication();

        try {
            await app.init();
            const schema = app.get(GraphQLSchemaHost).schema;
            const queryFields = schema.getQueryType()?.getFields();
            const mutationFields = schema.getMutationType()?.getFields();
            const userType = schema.getType('User');
            expect(queryFields).toHaveProperty('adminUsers');
            expect(queryFields).toHaveProperty('adminUser');
            expect(queryFields).toHaveProperty('adminUserStats');
            expect(queryFields).toHaveProperty('adminUserSessions');
            expect(mutationFields).toHaveProperty('adminCreateUser');
            expect(mutationFields).toHaveProperty(
                'adminRevokeUserSessions',
            );
            expect(mutationFields).toHaveProperty('adminUpdateUser');
            expect(mutationFields).toHaveProperty(
                'adminUpdateUserStatus',
            );
            expect(mutationFields).toHaveProperty(
                'adminUpdateUserRole',
            );
            expect(mutationFields).toHaveProperty('adminDeleteUser');

            const getFields = Reflect.get(
                userType ?? {},
                'getFields',
            );
            if (typeof getFields !== 'function') {
                throw new Error('User GraphQL type is not an object type');
            }

            const userFields: unknown = Reflect.apply(
                getFields,
                userType,
                [],
            );
            expect(userFields).not.toHaveProperty('passwordHash');
        } finally {
            await app.close();
        }
    });
});
