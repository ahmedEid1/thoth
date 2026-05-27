-- V2 fix: CorpusItem.externalDoi / externalArxivId were GLOBALLY unique,
-- which broke multi-tenant outbound search — once any project fetched
-- paper-X (DOI=10.1/foo), every OTHER project's attempt to fetch the same
-- paper hit a unique-constraint violation and silently failed.
--
-- Switch to per-project uniqueness so two users can both run an outbound
-- review that surfaces paper-X without colliding.

DROP INDEX IF EXISTS "CorpusItem_externalDoi_key";
DROP INDEX IF EXISTS "CorpusItem_externalArxivId_key";

CREATE UNIQUE INDEX "CorpusItem_projectId_externalDoi_key"
  ON "CorpusItem" ("projectId", "externalDoi");

CREATE UNIQUE INDEX "CorpusItem_projectId_externalArxivId_key"
  ON "CorpusItem" ("projectId", "externalArxivId");
