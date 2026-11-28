import type { GraphQLFormattedError } from 'graphql';

const ERROR_STATUS_CODES: Readonly<Record<string, number>> = {
    GRAPHQL_PARSE_FAILED: 400,
    GRAPHQL_VALIDATION_FAILED: 400,
    BAD_REQUEST: 400,
    BAD_USER_INPUT: 400,
    UNAUTHENTICATED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
};

export function formatGraphQLError(
    error: GraphQLFormattedError,
): GraphQLFormattedError {
    const extensions = error.extensions;

    const code =
        typeof extensions?.code === 'string'
            ? extensions.code
            : 'INTERNAL_SERVER_ERROR';

    const statusCode =
        typeof extensions?.statusCode === 'number'
            ? extensions.statusCode
            : (ERROR_STATUS_CODES[code] ?? 500);

    const details = Array.isArray(extensions?.details)
        ? extensions.details.filter(
            (detail): detail is string =>
                typeof detail === 'string',
        )
        : undefined;

    const message =
        statusCode >= 500
            ? statusCode === 503
                ? 'Service temporarily unavailable'
                : 'Internal server error'
            : error.message;

    return {
        message,
        locations: error.locations,
        path: error.path,

        extensions: {
            code,
            statusCode,
            ...(statusCode < 500 && typeof extensions?.authReason === 'string'
                ? { authReason: extensions.authReason }
                : {}),

            ...(statusCode < 500 &&
                details?.length
                ? { details }
                : {}),
        },
    };
}
