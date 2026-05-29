#!/bin/bash
# Make deployment scripts executable

chmod +x scripts/deploy.sh
chmod +x scripts/setup-prod.sh
chmod +x scripts/backup-db.sh
chmod +x scripts/health-check.sh

echo "✅ All deployment scripts are now executable"
