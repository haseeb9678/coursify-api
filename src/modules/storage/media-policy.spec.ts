import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { storageConfig } from '../../config/storage.config.js';
import type { MediaAsset } from '../../generated/prisma/client.js';
import { checkUpload, fileDisposition, matchesFileSignature } from './media-policy.js';
import { R2StorageProvider } from './r2-storage.provider.js';

describe('media policy', () => {
    const configuration = storageConfig(() => undefined);
    it('keeps URL-based content available when storage is disabled or incomplete', () => {
        expect(configuration.enabled).toBe(false);
        const partial = storageConfig((name) => name === 'STORAGE_ENABLED' ? 'true' : undefined);
        expect(partial.enabled).toBe(false);
        const provider = new R2StorageProvider(new ConfigService());
        expect(() => provider.requireClient()).toThrow('until R2 storage is configured');
    });

    it('rejects invalid booleans, endpoints, limits, and shared buckets', () => {
        for (const env of [
            { STORAGE_ENABLED: 'yes' },
            { R2_ENDPOINT: 'https://example.test' },
            { R2_MULTIPART_PART_SIZE_MB: '1' },
            { R2_PRIVATE_BUCKET: 'coursify-public' },
            { R2_STORAGE_SOFT_LIMIT_GB: '10', R2_STORAGE_HARD_LIMIT_GB: '9' },
        ]) {
            expect(() => storageConfig((name) => Reflect.get(env, name))).toThrow();
        }
    });

    it('enforces purpose-based size and declared type and checks actual bytes', () => {
        expect(checkUpload('LESSON_VIDEO', 'lesson.mp4', 'video/mp4', 100, configuration)).toMatchObject({ visibility: 'PRIVATE' });
        expect(checkUpload('HERO_IMAGE', 'background.webp', 'image/webp', 100, configuration)).toMatchObject({ visibility: 'PUBLIC' });
        expect(() => checkUpload('COURSE_THUMBNAIL', 'a.svg', 'image/svg+xml', 1, configuration)).toThrow();
        expect(() => checkUpload('COURSE_THUMBNAIL', 'a.png', 'text/html', 1, configuration)).toThrow();
        expect(() => checkUpload('HERO_IMAGE', 'a.png', 'image/png', configuration.imageLimit + 1, configuration)).toThrow();
        expect(matchesFileSignature('pdf', Buffer.from('%PDF-1.7\n'))).toBe(true);
        expect(matchesFileSignature('mp4', Buffer.from('00000018667479706d70343200000000', 'hex'))).toBe(true);
        expect(matchesFileSignature('mp4', Buffer.from('<svg>MP4</svg>'))).toBe(false);
        expect(matchesFileSignature('txt', Buffer.from('<script>'))).toBe(false);
        expect(fileDisposition('Résumé.pdf')).toContain('filename*=UTF-8');
        expect(fileDisposition('lesson.pdf', true)).toMatch(/^inline;/);
    });

    it('signs the exact length and conditional header for uploads without a fixed video read range', async () => {
        const provider = new R2StorageProvider(new ConfigService({
            STORAGE_ENABLED: 'true', R2_ACCOUNT_ID: 'a'.repeat(32), R2_PUBLIC_URL: 'https://media.example.test',
            R2_ACCESS_KEY_ID: 'b'.repeat(32), R2_SECRET_ACCESS_KEY: 'c'.repeat(64),
        }));
        const asset = {
            bucket: 'coursify-private', stagingBucket: 'coursify-private', objectKey: 'development/asset.mp4',
            sizeBytes: 123, mimeType: 'video/mp4', multipartId: 'fixture',
        } as MediaAsset;
        const put = new URL(await provider.signPut(asset, 60));
        expect(put.pathname).toBe('/coursify-private/staging/development/asset.mp4');
        expect(put.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host;if-none-match');
        const part = new URL(await provider.signPart(asset, 1, 123, 60));
        expect(part.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
        expect(part.searchParams.get('partNumber')).toBe('1');
        const read = new URL((await provider.signRead(asset)).url);
        expect(read.pathname).toBe('/coursify-private/development/asset.mp4');
        expect(read.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    });
});
