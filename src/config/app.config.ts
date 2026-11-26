import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
    const environment =
        process.env.NODE_ENV ?? 'development';

    return {
        name: process.env.APP_NAME ?? 'Coursify',

        port: Number(process.env.PORT ?? 4000),

        environment,

        frontendUrl: process.env.FRONTEND_URL,

        isDevelopment: environment === 'development',

        isProduction: environment === 'production',
    };
});