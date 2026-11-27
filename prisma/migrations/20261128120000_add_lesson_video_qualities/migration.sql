CREATE TABLE "lesson_video_qualities" (
    "lessonId" UUID NOT NULL,
    "height" INTEGER NOT NULL,
    "assetId" UUID NOT NULL,
    CONSTRAINT "lesson_video_qualities_pkey" PRIMARY KEY ("lessonId", "height"),
    CONSTRAINT "lesson_video_qualities_height_check" CHECK ("height" IN (360, 480, 720, 1080)),
    CONSTRAINT "lesson_video_qualities_lessonId_fkey" FOREIGN KEY ("lessonId")
        REFERENCES "course_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lesson_video_qualities_assetId_fkey" FOREIGN KEY ("assetId")
        REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lesson_video_qualities_lessonId_assetId_key" ON "lesson_video_qualities"("lessonId", "assetId");
CREATE INDEX "lesson_video_qualities_assetId_idx" ON "lesson_video_qualities"("assetId");

CREATE OR REPLACE VIEW media_asset_references AS
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
    SELECT r."mediaAssetId", 'RESOURCE', r.id FROM "lesson_resources" r WHERE r."mediaAssetId" IS NOT NULL
    UNION ALL
    SELECT q."assetId", 'LESSON', q."lessonId" FROM "lesson_video_qualities" q;

CREATE TRIGGER protect_quality_media BEFORE INSERT OR UPDATE OF "assetId" OR DELETE ON "lesson_video_qualities"
FOR EACH ROW EXECUTE FUNCTION protect_media_reference('assetId', 'LESSON_VIDEO', 'private');
