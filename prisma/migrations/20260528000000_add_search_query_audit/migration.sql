-- V2 — SearchQuery per-call audit table.
-- Spec: docs/superpowers/specs/thoth-v2-design.md §10 ("Dedicated SearchQuery
-- audit table from the original spec").
--
-- This migration is additive and backward-compatible:
--   - New table SearchQuery (one row per query × provider call the discoverer
--     made), with the exact query string, pre-dedup result count, and any
--     provider error.
--   - No changes to existing tables; uploaded_only runs never write rows here.
--
-- The discoverer writes these rows non-fatally, so a failed audit insert can
-- never break a run.

-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchQuery_runId_idx" ON "SearchQuery"("runId");

-- CreateIndex
CREATE INDEX "SearchQuery_runId_provider_idx" ON "SearchQuery"("runId", "provider");

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
