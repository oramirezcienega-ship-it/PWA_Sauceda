# =========================================================================
# Script de Respaldo Local de Supabase a OneDrive
# =========================================================================
# Este script realiza un volcado de la base de datos de Supabase y lo guarda
# en tu carpeta de OneDrive. Windows se encargará de subirlo a la nube.
# =========================================================================

# 1. CONFIGURACIÓN
# Reemplaza [TU_CONTRASEÑA] con la contraseña de tu base de datos de Supabase.
$SUPABASE_DB_URL = "postgresql://postgres:[TU_CONTRASEÑA]@db.odwxrcehbnygxcxmzold.supabase.co:5432/postgres"

# Carpeta de destino en tu OneDrive
$DESTINO_ONEDRIVE = "C:\Users\oscar\OneDrive\Respaldos_Sauceda"

# =========================================================================

# Crear la carpeta de destino si no existe
if (!(Test-Path -Path $DESTINO_ONEDRIVE)) {
    New-Item -ItemType Directory -Path $DESTINO_ONEDRIVE -Force | Out-Null
}

$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$FILENAME = "supabase_backup_$TIMESTAMP.sql"
$FULL_PATH = Join-Path $DESTINO_ONEDRIVE $FILENAME

Write-Host "Iniciando respaldo de Supabase..." -ForegroundColor Cyan

# Intentar usar Docker (método recomendado si tienes Docker Desktop)
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Host "Detectado Docker. Ejecutando pg_dump en contenedor postgres:17..." -ForegroundColor Yellow
    docker run --rm postgres:17-alpine pg_dump "$SUPABASE_DB_URL" > "$FULL_PATH"
}
# Si no hay Docker, intentar usar pg_dump local (si está en el PATH)
elif (Get-Command pg_dump -ErrorAction SilentlyContinue) {
    Write-Host "Detectado pg_dump local. Generando respaldo..." -ForegroundColor Yellow
    pg_dump "$SUPABASE_DB_URL" -f "$FULL_PATH"
}
else {
    Write-Host "ERROR: No se encontró Docker ni pg_dump.exe instalado en este equipo." -ForegroundColor Red
    Write-Host "Por favor instala Docker Desktop o descarga las herramientas de PostgreSQL." -ForegroundColor Yellow
    exit 1
}

# Verificar el resultado
if (Test-Path $FULL_PATH) {
    $SIZE = (Get-Item $FULL_PATH).Length
    if ($SIZE -gt 100) {
        Write-Host "¡Respaldo creado con éxito! Guardado en: $FULL_PATH ($( [Math]::Round($SIZE/1KB, 2) ) KB)" -ForegroundColor Green
        Write-Host "OneDrive iniciará la sincronización en segundo plano." -ForegroundColor Green
    } else {
        Write-Host "ADVERTENCIA: El archivo generado es muy pequeño ($SIZE bytes). Verifica tus credenciales." -ForegroundColor Yellow
    }
} else {
    Write-Host "ERROR: No se pudo generar el archivo de respaldo." -ForegroundColor Red
}
