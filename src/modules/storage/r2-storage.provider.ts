import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CopyObjectCommand, CreateMultipartUploadCommand,
    DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException,
    UploadPartCommand, type CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { storageConfig } from '../../config/storage.config.js';
import type { MediaAsset } from '../../generated/prisma/client.js';
import { fileDisposition } from './media-policy.js';

@Injectable()
export class R2StorageProvider {
    private readonly logger = new Logger(R2StorageProvider.name);
    readonly config;
    private readonly client?: S3Client;

    constructor(environment: ConfigService) {
        this.config = storageConfig((name) => environment.get(name));
        const { enabled, s3Origin, region, accessKeyId, secretAccessKey } = this.config;
        if (enabled) this.client = new S3Client({
            endpoint: s3Origin, region, credentials: { accessKeyId, secretAccessKey },
            forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
            maxAttempts: 2, requestHandler: { requestTimeout: 10000, connectionTimeout: 3000, throwOnRequestTimeout: true },
        });
    }

    requireClient() {
        if (!this.client) throw new BadRequestException('File uploads and private media are unavailable until R2 storage is configured.');
        return this.client;
    }

    private staging(asset: MediaAsset) {
        return { Bucket: asset.stagingBucket, Key: `staging/${asset.objectKey}` };
    }

    private async request<T>(operation: () => Promise<T>, missing?: T): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (missing !== undefined && error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return missing;
            const code = error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;
            this.logger.warn(`R2 request failed${code ? ` (HTTP ${code})` : ''}.`);
            throw new ServiceUnavailableException('Storage is temporarily unavailable. Try again.');
        }
    }

    signPut(asset: MediaAsset, expiresIn: number) {
        const client = this.requireClient();
        return getSignedUrl(client, new PutObjectCommand({
            ...this.staging(asset), ContentType: asset.mimeType, ContentLength: asset.sizeBytes, IfNoneMatch: '*',
        }), { expiresIn, signableHeaders: new Set(['content-type', 'content-length', 'if-none-match']) });
    }

    async startMultipart(asset: MediaAsset) {
        const client = this.requireClient();
        const result = await this.request(() => client.send(new CreateMultipartUploadCommand({
            ...this.staging(asset), ContentType: asset.mimeType, StorageClass: 'STANDARD',
        })));
        if (!result.UploadId) throw new ServiceUnavailableException('Storage could not initialize the upload.');
        return result.UploadId;
    }

    signPart(asset: MediaAsset, part: number, size: number, expiresIn: number) {
        const client = this.requireClient();
        return getSignedUrl(client, new UploadPartCommand({
            ...this.staging(asset), UploadId: asset.multipartId ?? undefined, PartNumber: part, ContentLength: size,
        }), { expiresIn, signableHeaders: new Set(['content-length']) });
    }

    async completeParts(asset: MediaAsset, parts: CompletedPart[]) {
        const client = this.requireClient();
        await this.request(() => client.send(new CompleteMultipartUploadCommand({
            ...this.staging(asset), UploadId: asset.multipartId ?? undefined, MultipartUpload: { Parts: parts }, IfNoneMatch: '*',
        })));
    }

    inspect(asset: MediaAsset) {
        const client = this.requireClient();
        return this.request(() => client.send(new HeadObjectCommand(this.staging(asset))), null);
    }

    async sample(asset: MediaAsset, etag: string) {
        const client = this.requireClient();
        const response = await this.request(() => client.send(new GetObjectCommand({
            ...this.staging(asset), Range: 'bytes=0-4095', IfMatch: etag,
        })));
        // Refuse an unexpectedly unbounded response before reading its body.
        if (!response.Body || !response.ContentLength || response.ContentLength > 4096) {
            if (response.Body && 'destroy' in response.Body) response.Body.destroy();
            throw new ServiceUnavailableException('Storage could not verify the file format.');
        }
        return response.Body.transformToByteArray();
    }

    async publish(asset: MediaAsset, etag: string) {
        const client = this.requireClient();
        const location = this.staging(asset);
        const disposition = asset.visibility === 'PRIVATE' && !asset.mimeType.startsWith('video/') ?
            fileDisposition(asset.originalFileName, asset.purpose === 'LESSON_DOCUMENT') : undefined;
        await this.request(() => client.send(new CopyObjectCommand({
            Bucket: asset.bucket, Key: asset.objectKey, CopySource: `${location.Bucket}/${location.Key}`,
            CopySourceIfMatch: etag, MetadataDirective: 'REPLACE', ContentType: asset.mimeType, ContentDisposition: disposition,
            CacheControl: asset.visibility === 'PUBLIC' ? 'public, max-age=31536000, immutable' : 'private, no-store',
            StorageClass: 'STANDARD',
        })));
    }

    async clearStaging(asset: MediaAsset) {
        const client = this.requireClient();
        if (asset.multipartId) {
            await this.request(() => client.send(new AbortMultipartUploadCommand({
                ...this.staging(asset), UploadId: asset.multipartId ?? undefined,
            })), null);
        }
        await this.request(() => client.send(new DeleteObjectCommand(this.staging(asset))));
    }

    async deleteFinal(asset: MediaAsset) {
        const client = this.requireClient();
        await this.request(() => client.send(new DeleteObjectCommand({ Bucket: asset.bucket, Key: asset.objectKey })));
    }

    signRead(asset: MediaAsset) {
        const client = this.requireClient();
        return getSignedUrl(client, new GetObjectCommand({ Bucket: asset.bucket, Key: asset.objectKey }), {
            expiresIn: this.config.readExpiry,
        }).then((url) => ({ url, expiresAt: new Date(Date.now() + this.config.readExpiry * 1000) }));
    }
}
