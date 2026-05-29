#!/bin/bash
# Backup database

set -e

BACKUP_DIR="./backups"
BACKUP_FILE="$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).sql.gz"

# Create backups directory
mkdir -p "$BACKUP_DIR"

echo "💾 Backing up database to $BACKUP_FILE..."

# Backup database
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres wallofanger | gzip > "$BACKUP_FILE"

# Keep only last 10 backups
echo "🧹 Cleaning up old backups..."
ls -t "$BACKUP_DIR"/backup-*.sql.gz | tail -n +11 | xargs -r rm

echo "✅ Backup complete: $BACKUP_FILE"
echo "📊 Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Optional: upload to S3 or other cloud storage
# aws s3 cp "$BACKUP_FILE" "s3://your-bucket/backups/"
