#!/usr/bin/env bash
set -euo pipefail

DEST_DIR="/home/oscar/supabase_backups"
mkdir -p "$DEST_DIR"

REMOTE_HOST="100.96.122.113"
REMOTE_PORT="2222"
REMOTE_USER="root"
REMOTE_PATH="/home/oscar/supabase_backups/daily/"

SSH_CMD="ssh -p ${REMOTE_PORT} -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sincronizando respaldos de Supabase desde Proxmox a Terreno..."
rsync -avz \
    -e "${SSH_CMD}" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}" \
    "${DEST_DIR}/"

# Retención en Terreno: 30 días
find "$DEST_DIR" -name "*.sql.gz" -type f -mtime +30 -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sincronización completada con éxito."
