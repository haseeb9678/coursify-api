CREATE TABLE "lesson_comments" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lesson_comments_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "course_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lesson_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "lesson_comments_lessonId_createdAt_id_idx" ON "lesson_comments"("lessonId", "createdAt" DESC, "id" DESC);
CREATE INDEX "lesson_comments_authorId_idx" ON "lesson_comments"("authorId");
