import {
    Catch,
    HttpException,
    HttpStatus,
    Logger,
    type ArgumentsHost,
} from '@nestjs/common';

import {
    GqlExceptionFilter,
    GqlArgumentsHost,
} from '@nestjs/graphql';

import { GraphQLError } from 'graphql';

import { mapPrismaError } from '../utils/prisma-error.util.js';

@Catch()
export class GraphqlExceptionFilter
    implements GqlExceptionFilter {
    private readonly logger = new Logger(
        GraphqlExceptionFilter.name,
    );

    catch(
        exception: unknown,
        host: ArgumentsHost,
    ): GraphQLError {
        const gqlHost = GqlArgumentsHost.create(host);

        // Preserve existing GraphQL errors.
        if (exception instanceof GraphQLError) {
            return exception;
        }

        // Convert known Prisma errors into NestJS exceptions.
        const mappedException =
            mapPrismaError(exception) ?? exception;

        if (mappedException instanceof HttpException) {
            const statusCode = mappedException.getStatus();

            const response = mappedException.getResponse();
            const authReason = statusCode < 500 && typeof response === 'object' &&
                'authReason' in response && typeof response.authReason === 'string'
                ? response.authReason
                : undefined;

            let message = mappedException.message;
            let details: string[] | undefined;

            if (
                typeof response === 'object' &&
                'message' in response
            ) {
                if (Array.isArray(response.message)) {
                    details = response.message.filter(
                        (item): item is string =>
                            typeof item === 'string',
                    );

                    message = 'Validation failed';
                } else if (
                    typeof response.message === 'string'
                ) {
                    message = response.message;
                }
            }

            if (statusCode >= 500) {
                this.logger.error(
                    `Operation: ${gqlHost.getInfo()?.fieldName}`,
                    exception instanceof Error
                        ? exception.stack
                        : undefined,
                );

                message =
                    statusCode === 503
                        ? 'Service temporarily unavailable'
                        : 'Internal server error';

                details = undefined;
            }

            return new GraphQLError(message, {
                extensions: {
                    code: this.getErrorCode(statusCode),
                    statusCode,
                    ...(authReason ? { authReason } : {}),
                    ...(details ? { details } : {}),
                },
            });
        }

        // Handle unexpected exceptions.
        this.logger.error(
            `Unexpected error in ${gqlHost.getInfo()?.fieldName}`,
            exception instanceof Error
                ? exception.stack
                : undefined,
        );

        return new GraphQLError('Internal server error', {
            extensions: {
                code: 'INTERNAL_SERVER_ERROR',
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            },
        });
    }

    private getErrorCode(statusCode: number): string {
        switch (statusCode) {
            case HttpStatus.BAD_REQUEST:
                return 'BAD_USER_INPUT';

            case HttpStatus.UNAUTHORIZED:
                return 'UNAUTHENTICATED';

            case HttpStatus.FORBIDDEN:
                return 'FORBIDDEN';

            case HttpStatus.NOT_FOUND:
                return 'NOT_FOUND';

            case HttpStatus.CONFLICT:
                return 'CONFLICT';

            case HttpStatus.UNPROCESSABLE_ENTITY:
                return 'UNPROCESSABLE_ENTITY';

            case HttpStatus.TOO_MANY_REQUESTS:
                return 'TOO_MANY_REQUESTS';

            case HttpStatus.SERVICE_UNAVAILABLE:
                return 'SERVICE_UNAVAILABLE';

            default:
                return statusCode >= 500
                    ? 'INTERNAL_SERVER_ERROR'
                    : 'REQUEST_FAILED';
        }
    }
}
