$lines = Get-Content ".env.local"
$url = ""
$key = ""
foreach ($line in $lines) {
    if ($line -match '^\s*SUPABASE_URL\s*=\s*"?([^"\r\n]+)"?') {
        $url = $matches[1].Trim()
    }
    if ($line -match '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\r\n]+)"?') {
        $key = $matches[1].Trim()
    }
}

if (-not $url) {
    Write-Error "No se encontro SUPABASE_URL"
    exit 1
}

$sql = Get-Content "supabase/migrations/0107_mensajes_whatsapp_mautic_tracking.sql" -Raw -Encoding UTF8

$headers = @{
    "apikey" = $key
    "Authorization" = "Bearer $key"
}

$jsonBody = @{ query = $sql } | ConvertTo-Json

Write-Host "Aplicando migracion 0107 a Staging: $url ..."
$response = Invoke-RestMethod -Uri "$url/pg/query" -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($jsonBody)) -ContentType "application/json; charset=utf-8"
$response | ConvertTo-Json -Depth 5
