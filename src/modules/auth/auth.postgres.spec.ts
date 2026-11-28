import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { CookieService } from './services/cookie.service.js';
import { SessionService } from './services/session.service.js';
import { TokenService } from './services/token.service.js';

const database = process.env.COMMERCE_TEST_DATABASE_URL;
const isolated = database && /^postgres(?:ql)?:\/\/[^@/]+@(?:localhost|127\.0\.0\.1):\d+\/coursify_commerce_test$/.test(database);
const time = new Date('2026-01-01T00:00:00Z').getTime();

describe.runIf(Boolean(isolated))('session rotation on disposable PostgreSQL', () => {
    let prisma: PrismaService;
    let auth: AuthService;
    let otherInstance: AuthService;
    let tokens: TokenService;
    let cookieService: CookieService;
    let sessionService: SessionService;

    beforeAll(() => {
        if (!database || !isolated) throw new Error('A disposable loopback PostgreSQL database is required.');
        const config = new ConfigService({
            database: { url: database },
            jwt: { accessSecret: 'a'.repeat(64), refreshSecret: 'b'.repeat(64), accessExpiresIn: 5,
                refreshExpiresIn: 60, sessionMaxAge: 180 },
            cookie: { secure: true, sameSite: 'lax' },
        });
        prisma = new PrismaService(config);
        sessionService = new SessionService(prisma);
        tokens = new TokenService(new JwtService(), config);
        cookieService = new CookieService(config);
        auth = new AuthService(new UsersService(prisma), tokens, sessionService);
        otherInstance = new AuthService(new UsersService(prisma), new TokenService(new JwtService(), config), new SessionService(prisma));
    });
    afterAll(async () => { await prisma?.$disconnect(); });
    afterEach(() => vi.useRealTimers());

    async function signIn() {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(time);
        const identity = { name: 'Test learner', email: `${randomUUID()}@fixture.example`, password: 'Test learner password 1' };
        const user = await auth.register(identity);
        const { tokens: initial } = await auth.login(identity, {});
        return { initial, user };
    }

    it('rotates once across instances, allows a bounded same-request retry, and synchronizes idle expiry', async () => {
        const { initial } = await signIn();
        vi.setSystemTime(time + 10_000);
        await expect(tokens.verifyAccessToken(initial.accessToken)).rejects.toMatchObject({
            response: { authReason: 'ACCESS_TOKEN_EXPIRED' },
        });

        const left = randomUUID(), right = randomUUID();
        const results = await Promise.allSettled([
            auth.refresh(initial.refreshToken, left), otherInstance.refresh(initial.refreshToken, right),
        ]);
        const winner = results.find((result) => result.status === 'fulfilled');
        const loser = results.find((result) => result.status === 'rejected');
        expect(loser?.reason).toMatchObject({ response: { authReason: 'REFRESH_ROTATION_CONFLICT' } });
        if (!winner) throw new Error('Expected exactly one rotation winner');
        const rotated = winner.value;
        const requestId = results[0] === winner ? left : right;
        const retried = await otherInstance.refresh(initial.refreshToken, requestId);
        expect(retried.refreshToken).toBe(rotated.refreshToken);
        expect((await otherInstance.refresh(rotated.refreshToken, requestId)).refreshToken).toBe(rotated.refreshToken);

        const payload = await tokens.verifyRefreshToken(rotated.refreshToken);
        const session = await prisma.refreshSession.findUniqueOrThrow({ where: { id: payload.sid } });
        expect(session.refreshTokenHash).toBe(tokens.hashRefreshToken(rotated.refreshToken));
        expect(session.refreshRequestHash).not.toBe(requestId);
        expect(session.expiresAt.getTime()).toBe(time + 70_000);
        expect(payload.exp! * 1000).toBe(session.expiresAt.getTime());
        const response = { cookie: vi.fn(), setHeader: vi.fn() };
        cookieService.setAuthCookies(response as unknown as Response, rotated);
        expect(response.cookie).toHaveBeenCalledWith('refresh_token', rotated.refreshToken, {
            secure: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60_000,
        });
        vi.setSystemTime(time + 26_000);
        await expect(otherInstance.refresh(initial.refreshToken, requestId)).rejects.toMatchObject({
            response: { authReason: 'REFRESH_TOKEN_INVALID' },
        });
    });

    it('caps sliding expiry and rejects expired, revoked, or missing refresh cookies', async () => {
        const { initial, user } = await signIn();
        let current = initial;
        for (const age of [50, 100, 150, 171]) {
            vi.setSystemTime(time + age * 1000);
            current = await auth.refresh(current.refreshToken, randomUUID());
        }
        expect(current.refreshExpiresAt.getTime()).toBe(time + 180_000);
        const payload = await tokens.verifyRefreshToken(current.refreshToken);
        await sessionService.revokeAllSessions(user.id);
        await expect(auth.refresh(current.refreshToken, randomUUID())).rejects.toMatchObject({
            response: { authReason: 'SESSION_REVOKED' },
        });
        expect(await prisma.refreshSession.findUniqueOrThrow({ where: { id: payload.sid } })).toHaveProperty('revokedAt', new Date(time + 171_000));

        vi.setSystemTime(time + 180_000);
        await expect(auth.refresh(current.refreshToken, randomUUID())).rejects.toMatchObject({
            response: { authReason: 'REFRESH_TOKEN_EXPIRED' },
        });
        await expect(auth.refresh(undefined, randomUUID())).rejects.toMatchObject({
            response: { authReason: 'REFRESH_COOKIE_MISSING' },
        });
    });

    it('revokes a rotated session when logout races the refresh response', async () => {
        const { initial } = await signIn();
        vi.setSystemTime(time + 10_000);
        const rotated = await otherInstance.refresh(initial.refreshToken, randomUUID());
        await auth.logout({ accessToken: initial.accessToken, refreshToken: initial.refreshToken });
        await expect(otherInstance.refresh(rotated.refreshToken, randomUUID())).rejects.toMatchObject({
            response: { authReason: 'SESSION_REVOKED' },
        });
    });
});
