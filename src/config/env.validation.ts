import { plainToInstance } from 'class-transformer';

import {
    IsEnum,
    IsInt,
    IsString,
    IsNotEmpty,
    IsUrl,
    IsIn,
    Matches,
    Min,
    Max,
    MinLength,
    validateSync,
} from 'class-validator';

enum Environment {
    Development = 'development',
    Production = 'production',
    Test = 'test',
}

class EnvironmentVariables {
    // Application configuration

    @IsEnum(Environment)
    NODE_ENV: Environment = Environment.Development;

    @IsString()
    @IsNotEmpty()
    APP_NAME: string = 'Coursify';

    @IsInt()
    @Min(1)
    @Max(65535)
    PORT: number = 4000;

    @IsUrl({
        require_tld: false,
        require_protocol: true,
        protocols: ['http', 'https'],

    })
    FRONTEND_URL!: string;

    // Database configuration

    @IsString()
    @IsNotEmpty()
    @Matches(/^postgres(?:ql)?:\/\//)
    DATABASE_URL!: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^postgres(?:ql)?:\/\//)
    DIRECT_URL!: string;

    // GraphQL configuration

    @IsString()
    @Matches(/^\/[a-zA-Z0-9/_-]*$/)
    GRAPHQL_PATH: string = '/graphql';

    @IsIn(['true', 'false'])
    GRAPHQL_INTROSPECTION: string = 'false';

    // JWT configuration

    @IsString()
    @MinLength(64)
    JWT_ACCESS_SECRET!: string;

    @IsString()
    @MinLength(64)
    JWT_REFRESH_SECRET!: string;

    @IsInt()
    @Min(1)
    JWT_ACCESS_EXPIRES_IN: number = 900;

    @IsInt()
    @Min(1)
    JWT_REFRESH_EXPIRES_IN: number = 604800;

    // Cookie configuration

    @IsIn(['true', 'false'])
    COOKIE_SECURE: string = 'false';

    @IsIn(['strict', 'lax', 'none'])
    COOKIE_SAME_SITE: string = 'lax';
}

export function validateEnv(
    config: Record<string, unknown>,
): EnvironmentVariables {
    const validatedConfig = plainToInstance(
        EnvironmentVariables,
        {
            ...config,

            COOKIE_SECURE:
                config.COOKIE_SECURE ??
                (
                    config.NODE_ENV === 'production'
                        ? 'true'
                        : 'false'
                ),
        },
        {
            enableImplicitConversion: true,
        },
    );

    // Validate individual environment variables
    const errors = validateSync(validatedConfig, {
        skipMissingProperties: false,

        validationError: {
            target: false,
            value: false,
        },
    });

    const messages = errors.flatMap((error) =>
        Object.values(error.constraints ?? {}),
    );

    // Additional security validation
    if (errors.length === 0) {
        // Access and refresh secrets must be different
        if (
            validatedConfig.JWT_ACCESS_SECRET ===
            validatedConfig.JWT_REFRESH_SECRET
        ) {
            messages.push(
                'JWT access and refresh secrets must be different.',
            );
        }

        // SameSite=None requires Secure=true
        if (
            validatedConfig.COOKIE_SAME_SITE === 'none' &&
            validatedConfig.COOKIE_SECURE !== 'true'
        ) {
            messages.push(
                'COOKIE_SECURE must be true when COOKIE_SAME_SITE is none.',
            );
        }

        // Require secure cookies in production
        if (
            validatedConfig.NODE_ENV === Environment.Production &&
            validatedConfig.COOKIE_SECURE !== 'true'
        ) {
            messages.push(
                'COOKIE_SECURE must be true in production.',
            );
        }

        // CORS requires a valid frontend origin
        try {
            const frontendUrl = new URL(
                validatedConfig.FRONTEND_URL,
            );

            if (
                frontendUrl.origin !==
                validatedConfig.FRONTEND_URL
            ) {
                messages.push(
                    'FRONTEND_URL must be an origin without a path, query, or trailing slash.',
                );
            }
        } catch {
            messages.push(
                'FRONTEND_URL must be a valid URL.',
            );
        }
    }

    // Throw combined validation errors
    if (messages.length > 0) {
        throw new Error(
            `Environment validation failed:\n${messages.join('\n')}`,
        );
    }

    return validatedConfig;
}