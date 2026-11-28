ALTER TABLE "refresh_sessions"
    ADD COLUMN "previousRefreshTokenHash" TEXT,
    ADD COLUMN "refreshRequestHash" TEXT,
    ADD COLUMN "refreshRotatedAt" TIMESTAMP(3);
