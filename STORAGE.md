# Coursify media storage

Coursify coordinates media through NestJS GraphQL. Browsers upload bytes directly to Cloudflare R2 over presigned PUT requests. The server verifies object metadata and a bounded byte sample, then copies the verified staging object to a separate final key. Public uploads stage in the private bucket. Existing external URLs remain valid, and the app never copies their contents into R2.

## Cloudflare setup

1. Create two **Standard** R2 buckets, `coursify-public` and `coursify-private`, or choose separate bucket pairs for development and production.
2. Leave the private bucket inaccessible from public domains and the R2 development URL. Connect a Cloudflare custom domain to the public bucket for production. Its `r2.dev` URL works for development where enabled.
3. Create Object Read & Write S3-compatible credentials scoped to these two buckets. Put the credentials in the **server** environment. The frontend only needs the public origin in `NEXT_PUBLIC_R2_PUBLIC_URL`, and only when Next.js image optimization will use it.
4. Set `STORAGE_ENABLED=true` and populate the required values from [.env.example](.env.example). `R2_ACCOUNT_ID` determines the default S3 endpoint. Set `R2_ENDPOINT` for a supported jurisdictional endpoint. `R2_PUBLIC_URL` is the HTTPS media origin, separate from the S3 API origin. Set `R2_NAMESPACE` when environments share a bucket pair.
5. Validate the migration with `npx prisma validate`, generate the client with `npm run prisma:generate`, and apply the additive migration using the normal deployment procedure with `npm run prisma:migrate:deploy`. If your database uses a transaction pooler, run the migration with the direct connection for the same database.

Missing credentials or a disabled storage flag disable new uploads and private reads. Existing external URLs and public files continue to use their existing addresses. Protect bucket credentials as application secrets.

### CORS

Use the actual frontend origins, including any development origin you use. Apply a policy like the following to the **private** bucket. The public bucket can use a narrower read-only policy.

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-lms.example.com"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "If-None-Match", "Range"],
    "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Range", "Content-Length", "Content-Type", "Content-Disposition"],
    "MaxAgeSeconds": 3600
  }
]
```

The browser sets the signed `Content-Length` header using the Blob size. Application JavaScript sets the signed content type and conditional header where required. Check that a multipart PUT exposes `ETag` to the browser. On the private bucket, configure an object lifecycle rule for the `staging/` prefix to expire completed staging objects after a day or longer and abort incomplete multipart uploads. Keep the rule scoped to staging so it never removes final files. [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/) · [R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)

## Upload and delivery

- `createMediaUpload` assigns the bucket, creates a durable reservation, and returns a presigned PUT or a multipart plan. `signMultipartUploadParts` signs the expected byte count for each part. The browser uploads up to three parts concurrently and retries failed parts while the current browser session is open.
- `completeMediaUpload` verifies the staged size, declared content type, and initial bytes before creating the final object. Repeated completion returns the verified asset. `abortMediaUpload` cancels the associated multipart upload and tracks any remaining staging cleanup.
- Public media preserves the existing URL fields with a canonical URL derived from the verified asset. Private lessons and resources store optional `MediaAsset` foreign keys. Older lesson URLs remain usable for authorized students. New lesson videos require a verified local MP4. Existing public course JSON import still accepts external media URLs.
- `lessonMediaAccess` and `lessonResourceAccess` check the actual course, lesson, and resource relationships and require enrollment or existing admin access. `lessonPreviewMediaAccess` signs video only for a lesson explicitly marked as preview on a published course. Students use their own account settings when uploading avatars. Course content uploads follow the existing admin-only editing permissions.
- Video uses the browser's HTML5 media element and requests ranges directly from the R2 signed URL. The player keeps the position and playback state when renewing authorization, with bounded recovery on errors. PDF lessons use the browser's PDF viewer, and downloadable resources use attachment headers. Issued URLs work until their expiry, even if a user's enrollment changes in the meantime.
- Use fast-start MP4 encoded with H.264 video and AAC audio for broad compatibility. The browser reads local video metadata when available. R2 stores the original upload and the app does not run encoding or transcoding jobs. Signature checks are bounded, and archive checks validate the container rather than its contents. Use trusted files. These checks are not malware scanning, and signed URLs do not restrict screen recording or copying.
- In the curriculum editor, open **Video quality options** after uploading an original lesson video. Add matching 360p, 480p, 720p, or 1080p MP4 exports of the same lesson. The player lists the attached versions and preserves playback position when switching. Each export counts toward the storage quota and uses the same authorization as the original.

## Limits and cleanup

Defaults are 5 MiB for images, 100 MiB for promotional video, 500 MiB for lesson video, 25 MiB for PDF lessons, and 50 MiB for resources. Multipart starts at 100 MiB with 10 MiB parts. The LMS warns at 8 GB and stops reserving at 9 GB. Reservations include both staging and final copies until staging can be safely cleared. An upload that expires before verification stays reserved until the next cleanup.

Open **Admin → Media Library** to view counts, verified public and private bytes, reservations, and attachments. These figures track this LMS database, while the Cloudflare dashboard shows account-wide usage and billing. The Standard free tier covers storage and operation allowances. External activity, other buckets, or request volume can still incur charges. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Replacing a file keeps the existing media active until the form saves. The library's cleanup action removes expired staging and unattached verified files after a seven-day grace period. It skips referenced assets, including shared public URLs. Explicit deletion also checks references immediately before marking the asset for idempotent removal. Run cleanup periodically through the authenticated Admin Media Library. The bounded action can be rerun to process additional items. The bucket lifecycle is independent of database cleanup.

## Verification with development R2

1. As an admin, upload a JPEG or WEBP thumbnail and a private MP4 larger than the configured multipart threshold in a draft course. Confirm progress, `ETag` visibility, successful save, and an authorized preview.
2. Attach a PDF and a downloadable resource. Publish the course through the existing workflow and enroll a test student.
3. In browser developer tools, play the lesson and seek ahead. Check that the media requests target R2 and that a requested byte range returns HTTP 206 with `Content-Range`. Confirm another account without access cannot obtain a signed URL.
4. For a dedicated development test, set the private expiry to 60 seconds. Play through a renewal, confirm the current time is restored, then repeat after revoking enrollment and verify renewal is denied. Remove only the test course's unused files through the Admin Media Library.
