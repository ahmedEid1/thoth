# Atlas

> GDPR-safe agentic workspace for systematic literature reviews.

**Status:** Work in progress (M1 — foundation). Full design spec: [`docs/superpowers/specs/2026-05-22-atlas-design.md`](docs/superpowers/specs/2026-05-22-atlas-design.md).

## Quickstart (local dev)

```bash
cp .env.example .env       # fill in Clerk + Trigger.dev keys
docker compose up -d       # Postgres + MinIO
pnpm install
pnpm prisma migrate dev    # after Task 3
pnpm dev                   # Next.js on :3000
pnpm dev:trigger           # Trigger.dev worker (after Task 9)
```

## License
MIT
