import { registerAs } from '@nestjs/config';

type CookieSameSite = 'strict' | 'lax' | 'none';

export default registerAs('cookie', () => ({
    secure:
        process.env.COOKIE_SECURE !== undefined
            ? process.env.COOKIE_SECURE === 'true'
            : process.env.NODE_ENV === 'production',

    sameSite: (
        process.env.COOKIE_SAME_SITE ?? 'lax'
    ) as CookieSameSite,
}));