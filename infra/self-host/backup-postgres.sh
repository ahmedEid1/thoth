#!/usr/bin/env bash
# Thoth — Postgres backup. Dumps the thoth DB to a timestamped gzip file in /backups
# (the mounted volume in docker-compose.prod.yml). Cron-runnable.
#
# Suggested crontab on the host:
#   0 3 * * * /opt/thoth/thoth/infra/self-host/backup-postgres.sh >> /var/log/thoth-backup.log 2>&1
#
# Retention: keeps the last 14 daily dumps; older ones are deleted.
# Restore:   gunzip -c thoth-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U thoth -d thoth

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

# Use the date that the dump *started*, not finished, so the filename matches the snapshot.
TIMESTAMP="$(date -u +%Y-%m-%d_%H%M%SZ)"
OUT="$BACKUP_DIR/thoth-${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] starting pg_dump → $OUT"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump --clean --if-exists --no-owner --no-privileges -U thoth -d thoth \
    | gzip -9 > "$OUT"

# Sanity check — empty/tiny file means something went wrong.
SIZE=$(stat -c %s "$OUT" 2>/dev/null || stat -f %z "$OUT")
if [ "$SIZE" -lt 1024 ]; then
    echo "[$(date -Iseconds)] ERROR: dump file is only ${SIZE} bytes; aborting cleanup" >&2
    exit 1
fi

echo "[$(date -Iseconds)] done (${SIZE} bytes). Pruning dumps older than ${RETENTION_DAYS} days."
find "$BACKUP_DIR" -name 'thoth-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete

echo "[$(date -Iseconds)] backup complete."
