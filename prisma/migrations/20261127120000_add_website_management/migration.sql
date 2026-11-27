BEGIN;

-- CreateEnum
CREATE TYPE "WebsiteContentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "HeroImagePosition" AS ENUM ('CENTER', 'CENTER_UP', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM');

-- CreateEnum
CREATE TYPE "PopupLayout" AS ENUM ('CENTERED', 'IMAGE_LEFT', 'IMAGE_TOP', 'TEXT_ONLY');

-- CreateEnum
CREATE TYPE "PopupTrigger" AS ENUM ('ON_PAGE_LOAD', 'AFTER_DELAY');

-- CreateEnum
CREATE TYPE "PopupFrequency" AS ENUM ('ONCE_PER_SESSION', 'ONCE_PER_VISITOR', 'ONCE_PER_DAY', 'EVERY_VISIT', 'CUSTOM_INTERVAL');

-- CreateEnum
CREATE TYPE "PopupAudience" AS ENUM ('ALL_VISITORS', 'GUESTS_ONLY', 'AUTHENTICATED_USERS');

-- CreateEnum
CREATE TYPE "PopupPageTarget" AS ENUM ('HOMEPAGE_ONLY', 'ALL_PUBLIC_PAGES', 'COURSE_CATALOG', 'SPECIFIC_PATHS');

-- CreateTable
CREATE TABLE "website_hero_slides" (
    "id" UUID NOT NULL,
    "internalName" VARCHAR(100) NOT NULL,
    "eyebrow" VARCHAR(60) NOT NULL DEFAULT '',
    "title" VARCHAR(110) NOT NULL DEFAULT '',
    "description" VARCHAR(260) NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "mobileImageUrl" TEXT,
    "imageAlt" VARCHAR(160) NOT NULL DEFAULT '',
    "imagePosition" "HeroImagePosition" NOT NULL DEFAULT 'CENTER',
    "primaryCtaLabel" VARCHAR(40) NOT NULL DEFAULT '',
    "primaryCtaHref" TEXT,
    "secondaryCtaLabel" VARCHAR(40) NOT NULL DEFAULT '',
    "secondaryCtaHref" TEXT,
    "position" INTEGER NOT NULL,
    "status" "WebsiteContentStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_hero_slides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_hero_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoplayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoplayDelayMs" INTEGER NOT NULL DEFAULT 6000,
    "loopEnabled" BOOLEAN NOT NULL DEFAULT true,
    "showNavigationArrows" BOOLEAN NOT NULL DEFAULT true,
    "showPaginationDots" BOOLEAN NOT NULL DEFAULT true,
    "pauseOnHover" BOOLEAN NOT NULL DEFAULT true,
    "pauseOnFocus" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_hero_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_promotional_popups" (
    "id" UUID NOT NULL,
    "internalName" VARCHAR(100) NOT NULL,
    "title" VARCHAR(110) NOT NULL DEFAULT '',
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "imageAlt" VARCHAR(160) NOT NULL DEFAULT '',
    "layout" "PopupLayout" NOT NULL DEFAULT 'CENTERED',
    "primaryCtaLabel" VARCHAR(40) NOT NULL DEFAULT '',
    "primaryCtaHref" TEXT,
    "secondaryCtaLabel" VARCHAR(40) NOT NULL DEFAULT '',
    "secondaryCtaHref" TEXT,
    "status" "WebsiteContentStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "triggerType" "PopupTrigger" NOT NULL DEFAULT 'ON_PAGE_LOAD',
    "delaySeconds" INTEGER NOT NULL DEFAULT 5,
    "displayFrequency" "PopupFrequency" NOT NULL DEFAULT 'ONCE_PER_SESSION',
    "repeatAfterHours" INTEGER,
    "audience" "PopupAudience" NOT NULL DEFAULT 'ALL_VISITORS',
    "pageTarget" "PopupPageTarget" NOT NULL DEFAULT 'HOMEPAGE_ONLY',
    "targetPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_promotional_popups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "website_hero_slides_position_id_idx" ON "website_hero_slides"("position", "id");

-- CreateIndex
CREATE INDEX "website_hero_slides_status_startsAt_endsAt_idx" ON "website_hero_slides"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "website_promotional_popups_status_startsAt_endsAt_idx" ON "website_promotional_popups"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "website_promotional_popups_priority_createdAt_id_idx" ON "website_promotional_popups"("priority", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "website_hero_slides" ADD CONSTRAINT "website_hero_slides_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_hero_slides" ADD CONSTRAINT "website_hero_slides_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_hero_settings" ADD CONSTRAINT "website_hero_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_promotional_popups" ADD CONSTRAINT "website_promotional_popups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_promotional_popups" ADD CONSTRAINT "website_promotional_popups_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Constrain global settings to a single row.
ALTER TABLE "website_hero_settings" ADD CONSTRAINT "website_hero_settings_singleton" CHECK ("id" = 1);
ALTER TABLE "website_hero_settings" ADD CONSTRAINT "website_hero_settings_accessible_controls" CHECK ("showNavigationArrows" OR "showPaginationDots");
ALTER TABLE "website_hero_settings" ADD CONSTRAINT "website_hero_settings_autoplay_delay" CHECK ("autoplayDelayMs" BETWEEN 3000 AND 15000);
INSERT INTO "website_hero_settings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;

-- Import the existing homepage banners with stable identifiers.
INSERT INTO "website_hero_slides" ("id", "internalName", "eyebrow", "title", "description", "imageUrl", "imageAlt", "imagePosition", "primaryCtaLabel", "primaryCtaHref", "secondaryCtaLabel", "secondaryCtaHref", "position", "status", "updatedAt")
VALUES
    ('b1a96046-8314-4c20-baa0-515ab55ae90c', 'learning-without-limits', 'Learning without limits', 'Your next big move starts here.', 'Build in-demand skills, learn from industry experts, and unlock new opportunities at your own pace.', 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1920&q=85', 'Students collaborating in a modern learning environment', 'CENTER', 'Explore courses', '/courses', '', NULL, 1, 'ACTIVE', CURRENT_TIMESTAMP),
    ('f1e785f8-cc52-4636-8790-4d885771b954', 'career-growth', 'Build your future', 'Turn knowledge into opportunity.', 'Master practical skills and take the next confident step toward your professional goals.', 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1920&q=85', 'Professionals working together in a modern workspace', 'CENTER_UP', 'Start learning', '/courses', '', NULL, 2, 'ACTIVE', CURRENT_TIMESTAMP),
    ('6391bbc6-dde9-4576-9e32-fe60fa28afb2', 'expert-learning', 'Learn from the best', 'Invest in skills that matter.', 'Discover expert-led courses designed to help you grow, innovate, and succeed in a changing world.', 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1920&q=85', 'Professional learning using a laptop', 'CENTER', 'Discover courses', '/courses', 'Become an instructor', '/teach', 3, 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

COMMIT;
