import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';

import cookieParser from 'cookie-parser';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const logger = new Logger('Bootstrap');

  // Application configuration
  const port =
    configService.getOrThrow<number>('app.port');

  const appName =
    configService.getOrThrow<string>('app.name');

  const environment =
    configService.getOrThrow<string>('app.environment');

  const frontendURL =
    configService.getOrThrow<string>('app.frontendUrl');

  const graphqlPath =
    configService.getOrThrow<string>('graphql.path');

  // Parse incoming request cookies
  app.use(cookieParser());

  // Cross-Origin Resource Sharing (CORS)
  app.enableCors({
    origin: frontendURL,

    credentials: true,

    methods: ['GET', 'POST', 'OPTIONS'],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Apollo-Require-Preflight',
      'X-Apollo-Operation-Name',
    ],
  });

  // Global request validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,

      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  // Support graceful application shutdown
  app.enableShutdownHooks();

  // Start the HTTP server
  await app.listen(port, '0.0.0.0');

  const serverUrl = await app.getUrl();

  // Application startup logs
  logger.log(`${appName} backend started successfully`);
  logger.log(`Environment: ${environment}`);
  logger.log(`Server URL: ${serverUrl}`);
  logger.log(`GraphQL URL: ${serverUrl}${graphqlPath}`);
}

// Handle application startup failures
bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');

  logger.error('Application failed to start', error);

  process.exit(1);
});