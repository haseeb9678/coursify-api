import { registerAs } from '@nestjs/config';

export default registerAs('graphql', () => ({
    path: process.env.GRAPHQL_PATH ?? '/graphql',

    introspection:
        process.env.GRAPHQL_INTROSPECTION === 'true',

    isDevelopment:
        process.env.NODE_ENV === 'development',
}));