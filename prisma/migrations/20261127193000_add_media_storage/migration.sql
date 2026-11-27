-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('COURSE_THUMBNAIL', 'COURSE_PROMOTIONAL_VIDEO', 'CATEGORY_IMAGE', 'USER_AVATAR', 'HERO_IMAGE', 'HERO_MOBILE_IMAGE', 'PROMOTIONAL_POPUP_IMAGE', 'LESSON_VIDEO', 'LESSON_DOCUMENT', 'LESSON_RESOURCE');

-- CreateEnum
CREATE TYPE "MediaVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'ABORTED', 'DELETING', 'DELETED');

-- AlterTable
ALTER TABLE "course_lessons" ADD COLUMN     "documentAssetId" UUID,
ADD COLUMN     "videoAssetId" UUID;

-- AlterTable
ALTER TABLE "lesson_resources" ADD COLUMN     "mediaAssetId" UUID;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "uploadedById" UUID,
    "courseScopeId" UUID,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "stagingBucket" TEXT NOT NULL,
    "publicUrl" TEXT,
    "originalFileName" VARCHAR(255) NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "visibility" "MediaVisibility" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "multipartId" TEXT,
    "partSize" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "stagingPending" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_request_limits" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requests" INTEGER NOT NULL,

    CONSTRAINT "media_request_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_publicUrl_key" ON "media_assets"("publicUrl");

-- CreateIndex
CREATE INDEX "media_assets_status_expiresAt_idx" ON "media_assets"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "media_assets_createdAt_id_idx" ON "media_assets"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_uploadedById_requestId_key" ON "media_assets"("uploadedById", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_bucket_objectKey_key" ON "media_assets"("bucket", "objectKey");

-- CreateIndex
CREATE INDEX "course_lessons_videoAssetId_idx" ON "course_lessons"("videoAssetId");

-- CreateIndex
CREATE INDEX "course_lessons_documentAssetId_idx" ON "course_lessons"("documentAssetId");

-- CreateIndex
CREATE INDEX "lesson_resources_mediaAssetId_idx" ON "lesson_resources"("mediaAssetId");

-- AddForeignKey
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_videoAssetId_fkey" FOREIGN KEY ("videoAssetId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_documentAssetId_fkey" FOREIGN KEY ("documentAssetId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION media_url_key(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT AS $$
    WITH cleaned AS (SELECT split_part(split_part(trim(value), '?', 1), '#', 1) AS url),
    parts AS (SELECT url, regexp_match(url, '^https://([^/]+)(/.*)$', 'i') AS path FROM cleaned)
    SELECT COALESCE('https://' || regexp_replace(lower(path[1]), ':443$', '') || path[2], url) FROM parts;
$$;

CREATE VIEW media_asset_references AS
    SELECT a.id AS "assetId", 'COURSE'::text AS "entityType", c.id AS "entityId"
      FROM "courses" c JOIN "media_assets" a ON a."publicUrl" IN (media_url_key(c."thumbnailUrl"), media_url_key(c."promotionalVideoUrl"))
    UNION ALL
    SELECT a.id, 'CATEGORY', c.id FROM "categories" c JOIN "media_assets" a ON a."publicUrl" = media_url_key(c."imageUrl")
    UNION ALL
    SELECT a.id, 'AVATAR', u.id FROM "users" u JOIN "media_assets" a ON a."publicUrl" = media_url_key(u.avatar)
    UNION ALL
    SELECT a.id, 'HERO', h.id FROM "website_hero_slides" h JOIN "media_assets" a ON a."publicUrl" IN (media_url_key(h."imageUrl"), media_url_key(h."mobileImageUrl"))
    UNION ALL
    SELECT a.id, 'POPUP', p.id FROM "website_promotional_popups" p JOIN "media_assets" a ON a."publicUrl" = media_url_key(p."imageUrl")
    UNION ALL
    SELECT l."videoAssetId", 'LESSON', l.id FROM "course_lessons" l WHERE l."videoAssetId" IS NOT NULL
    UNION ALL
    SELECT l."documentAssetId", 'LESSON', l.id FROM "course_lessons" l WHERE l."documentAssetId" IS NOT NULL
    UNION ALL
    SELECT r."mediaAssetId", 'RESOURCE', r.id FROM "lesson_resources" r WHERE r."mediaAssetId" IS NOT NULL;

-- Keep references and cleanup synchronized even when a legacy mutation writes a public URL.
CREATE FUNCTION protect_media_reference() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    new_value TEXT;
    old_value TEXT;
    new_asset "media_assets"%ROWTYPE;
BEGIN
    IF TG_OP <> 'DELETE' THEN new_value := to_jsonb(NEW)->>TG_ARGV[0]; END IF;
    IF TG_OP <> 'INSERT' THEN old_value := to_jsonb(OLD)->>TG_ARGV[0]; END IF;
    IF new_value IS DISTINCT FROM old_value THEN
        IF TG_ARGV[2] = 'public' THEN
            SELECT * INTO new_asset FROM "media_assets" WHERE "publicUrl" = media_url_key(new_value) FOR UPDATE;
            UPDATE "media_assets" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "publicUrl" = media_url_key(old_value);
        ELSE
            SELECT * INTO new_asset FROM "media_assets" WHERE "id" = new_value::uuid FOR UPDATE;
            UPDATE "media_assets" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = old_value::uuid;
        END IF;
        IF new_asset.id IS NOT NULL AND (new_asset.status <> 'READY' OR new_asset.purpose::text <> TG_ARGV[1]) THEN
            RAISE EXCEPTION 'The selected media is unavailable for this field' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER protect_thumbnail_media BEFORE INSERT OR UPDATE OF "thumbnailUrl" OR DELETE ON "courses"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('thumbnailUrl', 'COURSE_THUMBNAIL', 'public');
CREATE TRIGGER protect_promo_media BEFORE INSERT OR UPDATE OF "promotionalVideoUrl" OR DELETE ON "courses"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('promotionalVideoUrl', 'COURSE_PROMOTIONAL_VIDEO', 'public');
CREATE TRIGGER protect_category_media BEFORE INSERT OR UPDATE OF "imageUrl" OR DELETE ON "categories"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('imageUrl', 'CATEGORY_IMAGE', 'public');
CREATE TRIGGER protect_avatar_media BEFORE INSERT OR UPDATE OF "avatar" OR DELETE ON "users"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('avatar', 'USER_AVATAR', 'public');
CREATE TRIGGER protect_hero_media BEFORE INSERT OR UPDATE OF "imageUrl" OR DELETE ON "website_hero_slides"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('imageUrl', 'HERO_IMAGE', 'public');
CREATE TRIGGER protect_hero_mobile_media BEFORE INSERT OR UPDATE OF "mobileImageUrl" OR DELETE ON "website_hero_slides"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('mobileImageUrl', 'HERO_MOBILE_IMAGE', 'public');
CREATE TRIGGER protect_popup_media BEFORE INSERT OR UPDATE OF "imageUrl" OR DELETE ON "website_promotional_popups"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('imageUrl', 'PROMOTIONAL_POPUP_IMAGE', 'public');
CREATE TRIGGER protect_video_media BEFORE INSERT OR UPDATE OF "videoAssetId" OR DELETE ON "course_lessons"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('videoAssetId', 'LESSON_VIDEO', 'private');
CREATE TRIGGER protect_document_media BEFORE INSERT OR UPDATE OF "documentAssetId" OR DELETE ON "course_lessons"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('documentAssetId', 'LESSON_DOCUMENT', 'private');
CREATE TRIGGER protect_resource_media BEFORE INSERT OR UPDATE OF "mediaAssetId" OR DELETE ON "lesson_resources"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('mediaAssetId', 'LESSON_RESOURCE', 'private');

