-- V2 outbound search — extend the two run/HITL enums.
-- Spec: docs/superpowers/specs/thoth-v2-design.md §2.
--
-- Postgres requires `ALTER TYPE ... ADD VALUE` to be outside a transaction
-- block for the new values to be immediately usable. Prisma's migration
-- runner runs each statement separately, so this is fine.

ALTER TYPE "RunStatus" ADD VALUE 'DISCOVERING';
ALTER TYPE "RunStatus" ADD VALUE 'AWAITING_DISCOVERY_APPROVAL';
ALTER TYPE "RunStatus" ADD VALUE 'FETCHING';
ALTER TYPE "RunStatus" ADD VALUE 'SCREENING';

ALTER TYPE "CheckpointKind" ADD VALUE 'APPROVE_DISCOVERY';
