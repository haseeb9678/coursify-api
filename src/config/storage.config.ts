export const MiB = 1024 * 1024;
export const GB = 1000 * 1000 * 1000;

type ReadConfig = (name: string) => unknown;
const bucketName = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const accountName = /^[a-f0-9]{32}$/i;
const namespaceName = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function storageConfig(read: ReadConfig) {
    const problems: string[] = [];
    function value(name: string, fallback = '') {
        const input = read(name);
        return typeof input === 'string' && input.trim() ? input.trim() : fallback;
    }
    function number(name: string, fallback: number, min: number, max: number) {
        const raw = value(name, String(fallback));
        const result = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(result) || result < min || result > max) {
            problems.push(`${name} must be an integer from ${min} to ${max}.`);
            return fallback;
        }
        return result;
    }
    function httpsOrigin(name: string, input: string) {
        if (!input) return '';
        try {
            const parsed = new URL(input);
            if (parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
                parsed.pathname === '/' && !parsed.search && !parsed.hash && !parsed.port) return parsed.origin;
        } catch {
            // Report the configuration name without disclosing the supplied value.
        }
        problems.push(`${name} must be an HTTPS origin.`);
        return '';
    }
    const enabled = value('STORAGE_ENABLED', 'false');
    const account = value('R2_ACCOUNT_ID');
    const accessKeyId = value('R2_ACCESS_KEY_ID');
    const secretAccessKey = value('R2_SECRET_ACCESS_KEY');
    const s3Origin = httpsOrigin('R2_ENDPOINT', value('R2_ENDPOINT', account ? `https://${account}.r2.cloudflarestorage.com` : ''));
    const publicOrigin = httpsOrigin('R2_PUBLIC_URL', value('R2_PUBLIC_URL'));
    const publicBucket = value('R2_PUBLIC_BUCKET', 'coursify-public');
    const privateBucket = value('R2_PRIVATE_BUCKET', 'coursify-private');
    const namespace = value('R2_NAMESPACE', value('NODE_ENV') === 'production' ? 'production' : 'development');
    const region = value('R2_REGION', 'auto');
    const softLimit = number('R2_STORAGE_SOFT_LIMIT_GB', 8, 1, 1000) * GB;
    const hardLimit = number('R2_STORAGE_HARD_LIMIT_GB', 9, 1, 1000) * GB;
    if (!['true', 'false'].includes(enabled)) problems.push('STORAGE_ENABLED must be true or false.');
    if (account && !accountName.test(account)) problems.push('R2_ACCOUNT_ID must be a Cloudflare account identifier.');
    if (s3Origin && !/^https:\/\/[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/i.test(s3Origin)) {
        problems.push('R2_ENDPOINT must be a Cloudflare R2 S3 endpoint.');
    }
    if (account && s3Origin && !s3Origin.toLowerCase().startsWith(`https://${account.toLowerCase()}.`)) {
        problems.push('R2_ENDPOINT and R2_ACCOUNT_ID must use the same account.');
    }
    if (publicOrigin === s3Origin && s3Origin) problems.push('R2_PUBLIC_URL must use the public media domain.');
    if (!bucketName.test(publicBucket) || !bucketName.test(privateBucket) || publicBucket === privateBucket) {
        problems.push('Configure two distinct valid R2 bucket names.');
    }
    if (!namespaceName.test(namespace)) problems.push('R2_NAMESPACE must use lowercase letters, numbers, or hyphens.');
    if (region !== 'auto') problems.push('R2_REGION must be auto.');
    if (softLimit > hardLimit) problems.push('The R2 soft limit must not exceed the hard limit.');
    const settings = {
        enabled: enabled === 'true' && Boolean(s3Origin && publicOrigin && accessKeyId && secretAccessKey),
        s3Origin, publicOrigin, publicBucket, privateBucket, namespace, region, accessKeyId, secretAccessKey,
        uploadExpiry: number('R2_UPLOAD_URL_EXPIRY_SECONDS', 900, 60, 3600),
        readExpiry: number('R2_PRIVATE_READ_URL_EXPIRY_SECONDS', 1800, 60, 7200),
        imageLimit: number('R2_MAX_IMAGE_SIZE_MB', 5, 1, 50) * MiB,
        videoLimit: number('R2_MAX_VIDEO_SIZE_MB', 500, 1, 1024) * MiB,
        promoLimit: number('R2_MAX_PROMO_VIDEO_SIZE_MB', 100, 1, 512) * MiB,
        documentLimit: number('R2_MAX_DOCUMENT_SIZE_MB', 25, 1, 200) * MiB,
        resourceLimit: number('R2_MAX_RESOURCE_SIZE_MB', 50, 1, 200) * MiB,
        multipartThreshold: number('R2_MULTIPART_THRESHOLD_MB', 100, 5, 512) * MiB,
        partSize: number('R2_MULTIPART_PART_SIZE_MB', 10, 5, 100) * MiB,
        softLimit, hardLimit,
    };
    if (problems.length) throw new Error(problems.join('\n'));
    return settings;
}

export type StorageConfig = ReturnType<typeof storageConfig>;
