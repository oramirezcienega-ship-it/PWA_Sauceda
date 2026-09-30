$envFile = Join-Path $PSScriptRoot "..\.env.local"
$env = @{}
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)\s*=\s*(.*)\s*$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            $env[$key] = $val
        }
    }
}

$sbUrl = $env["SUPABASE_URL"]
if (-not $sbUrl) { $sbUrl = $env["NEXT_PUBLIC_SUPABASE_URL"] }
$sbKey = $env["SUPABASE_SERVICE_ROLE_KEY"]

$headers = @{
    "apikey" = $sbKey
    "Authorization" = "Bearer $sbKey"
}

$cfgToken = Invoke-RestMethod -Uri "$sbUrl/rest/v1/configuracion_agente?clave=eq.meta_system_user_token" -Headers $headers -Method Get
$token = $cfgToken[0].valor

$cfgWaba = Invoke-RestMethod -Uri "$sbUrl/rest/v1/configuracion_agente?clave=eq.whatsapp_waba_id" -Headers $headers -Method Get
$wabaId = if ($cfgWaba.Count -gt 0 -and $cfgWaba[0].valor) { $cfgWaba[0].valor } else { $env["WHATSAPP_WABA_ID"] }

$metaHeaders = @{ "Authorization" = "Bearer $token" }
$res = Invoke-RestMethod -Uri "https://graph.facebook.com/v21.0/$wabaId/message_templates?limit=100" -Headers $metaHeaders -Method Get

$nuevas = @(
    "seguimiento_cotizacion_vigencia",
    "reactivacion_herreria_sauceda",
    "reactivacion_cisternas_aljibes",
    "reactivacion_imper_ruta_tecnica",
    "reactivacion_piso_estampado_v2",
    "reactivacion_remodelacion_presup"
)

Write-Output "=== ESTADO ACTUAL DE LAS 6 NUEVAS PLANTILLAS EN META ==="
foreach ($n in $nuevas) {
    $match = $res.data | Where-Object { $_.name -eq $n }
    if ($match) {
        Write-Output "[$($match.status)] $($match.name) - $($match.category) (ID: $($match.id))"
    } else {
        Write-Output "[NO ENCONTRADA] $n"
    }
}
