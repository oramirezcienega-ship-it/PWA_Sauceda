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

if (-not $token -or -not $wabaId) {
    Write-Error "Falta el token de Meta o el WABA ID."
    exit 1
}

Write-Output "Conectado a Meta Cloud API para WABA: $wabaId"

$jsonFile = Join-Path $PSScriptRoot "nuevas-plantillas.json"
$plantillas = Get-Content $jsonFile -Raw -Encoding UTF8 | ConvertFrom-Json

$metaUrl = "https://graph.facebook.com/v21.0/$wabaId/message_templates"

foreach ($p in $plantillas) {
    Write-Output "--------------------------------------------------------"
    Write-Output "Registrando plantilla: $($p.name)..."
    $json = $p | ConvertTo-Json -Depth 10

    try {
        $res = Invoke-RestMethod -Uri $metaUrl -Method Post -Headers @{
            Authorization = "Bearer $token"
            "Content-Type" = "application/json; charset=utf-8"
        } -Body ([System.Text.Encoding]::UTF8.GetBytes($json))

        Write-Output "SUCCESS: ID: $($res.id) | Status: $($res.status)"
    } catch {
        Write-Output "ERROR registrando $($p.name):"
        if ($_.ErrorDetails) {
            Write-Output $_.ErrorDetails.Message
        } else {
            Write-Output $_.Exception.Message
        }
    }
}
