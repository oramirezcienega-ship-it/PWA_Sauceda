#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: SUPABASE_DB_URL no está configurada en ${ENV_FILE}" >&2
    exit 1
fi

HOURLY_DIR="${SCRIPT_DIR}/hourly"
DAILY_DIR="${SCRIPT_DIR}/daily"
mkdir -p "$HOURLY_DIR" "$DAILY_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="sauceda_prod_${TIMESTAMP}.sql.gz"
TARGET_FILE="${HOURLY_DIR}/${FILENAME}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando respaldo de Supabase Prod..."

docker run --rm postgres:17-alpine pg_dump "$SUPABASE_DB_URL" | gzip > "$TARGET_FILE"

FILESIZE=$(stat -c%s "$TARGET_FILE" 2>/dev/null || stat -f%z "$TARGET_FILE" 2>/dev/null || echo 0)

if [ "$FILESIZE" -le 1000 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: El respaldo está vacío o falló (tamaño ${FILESIZE} bytes)." >&2
    rm -f "$TARGET_FILE"
    exit 1
fi

HUMAN_SIZE=$(du -sh "$TARGET_FILE" | awk '{print $1}')
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Respaldo horario creado: ${FILENAME} (${HUMAN_SIZE})"

# Copia diaria a las 23 horas
HOUR=$(date +"%H")
if [ "$HOUR" -eq 23 ]; then
    cp "$TARGET_FILE" "${DAILY_DIR}/${FILENAME}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Guardada copia consolidada diaria en ${DAILY_DIR}/"
fi

# Retención: 48 horas para horarios, 30 días para diarios
find "$HOURLY_DIR" -name "sauceda_prod_*.sql.gz" -type f -mtime +2 -delete
find "$DAILY_DIR" -name "sauceda_prod_*.sql.gz" -type f -mtime +30 -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Proceso completado exitosamente."
