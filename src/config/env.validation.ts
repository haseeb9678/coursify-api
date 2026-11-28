import { plainToInstance } from 'class-transformer';
import { storageConfig } from './storage.config.js';

import {
    IsEnum,
    IsInt,
    IsString,
    IsNotEmpty,
    IsUrl,
    IsIn,
    ValidateIf,
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

    @IsInt()
    @Min(1)
    JWT_SESSION_MAX_AGE: number = 604800;

    // Sandbox checkout is opt-in. Empty secrets leave the rest of the LMS available.
    @IsIn(['true', 'false'])
    PAYMENTS_ENABLED: string = 'false';

    @IsIn(['test'])
    STRIPE_MODE: string = 'test';

    @ValidateIf((_config, value: unknown) => value !== undefined && value !== '')
    @Matches(/^(?:sk|rk)_test_[A-Za-z0-9]+$/, { message: 'STRIPE_SECRET_KEY must use Sandbox credentials.' })
    STRIPE_SECRET_KEY?: string;

    @ValidateIf((_config, value: unknown) => value !== undefined && value !== '')
    @Matches(/^whsec_[A-Za-z0-9]+$/, { message: 'STRIPE_WEBHOOK_SECRET must use a signing secret.' })
    STRIPE_WEBHOOK_SECRET?: string;

    @ValidateIf((_config, value: unknown) => value !== undefined && value !== '')
    @Matches(/^[1-9][0-9]{0,7}$/)
    STRIPE_USD_MIN_MINOR_UNITS?: string;

    @ValidateIf((_config, value: unknown) => value !== undefined && value !== '')
    @Matches(/^[1-9][0-9]{0,7}$/)
    STRIPE_PKR_MIN_MINOR_UNITS?: string;

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

            JWT_SESSION_MAX_AGE: config.JWT_SESSION_MAX_AGE ?? config.JWT_REFRESH_EXPIRES_IN ?? 604800,

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
        if (validatedConfig.JWT_SESSION_MAX_AGE < validatedConfig.JWT_REFRESH_EXPIRES_IN) {
            messages.push('JWT_SESSION_MAX_AGE must be at least JWT_REFRESH_EXPIRES_IN.');
        }

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

    try {
        storageConfig((name) => config[name]);
    } catch (error) {
        if (error instanceof Error) messages.push(error.message);
    }

    // Throw combined validation errors
    if (messages.length > 0) {
        throw new Error(
            `Environment validation failed:\n${messages.join('\n')}`,
        );
    }

    return validatedConfig;
}
