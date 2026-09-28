# Script para registrar la plantilla oficial de agradecimiento y redes en Meta Cloud API
$envFile = Join-Path $PSScriptRoot "..\.env.local"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)\s*=\s*(.*)\s*$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $val)
        }
    }
}

$supabaseUrl = [System.Environment]::GetEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL")
$supabaseKey = [System.Environment]::GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")

$token = [System.Environment]::GetEnvironmentVariable("WHATSAPP_TOKEN")
$wabaId = [System.Environment]::GetEnvironmentVariable("WHATSAPP_WABA_ID")

if ($supabaseUrl -and $supabaseKey) {
    try {
        $uri = "$supabaseUrl/rest/v1/configuracion_agente?select=clave,valor&clave=in.(whatsapp_oauth_token,whatsapp_waba_id)"
        $headers = @{
            apikey = $supabaseKey
            Authorization = "Bearer $supabaseKey"
        }
        $configs = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
        foreach ($c in $configs) {
            if ($c.clave -eq "whatsapp_oauth_token" -and $c.valor) { $token = $c.valor.Trim() }
            if ($c.clave -eq "whatsapp_waba_id" -and $c.valor) { $wabaId = $c.valor.Trim() }
        }
    } catch {
        Write-Warning "No se pudo leer configuracion_agente desde Supabase, usando variables locales."
    }
}

if (-not $token -or -not $wabaId) {
    Write-Error "Faltan credenciales WHATSAPP_TOKEN o WHATSAPP_WABA_ID."
    exit 1
}

$plantilla = @{
    name = "agradecimiento_cliente_redes"
    category = "MARKETING"
    language = "es_MX"
    components = @(
        @{
            type = "HEADER"
            format = "TEXT"
            text = "¡Gracias por confiar en SAUCEDA! 🏡✨"
        },
        @{
            type = "BODY"
            text = "¡Hola {{1}}! Esperamos que te encuentres muy bien.`n`nEn *SAUCEDA* queremos agradecerte de corazón tu preferencia y confianza para realizar tu proyecto. Nuestro compromiso siempre es brindarte la mejor atención y la más alta calidad.`n`nTe invitamos con gusto a sumarte a nuestra comunidad en redes sociales, donde compartimos consejos prácticos de mantenimiento, novedades y proyectos:`n`n• TikTok: https://www.tiktok.com/@saucedamxbr`n• Instagram: https://www.instagram.com/saucedamx_/`n• Facebook: https://www.facebook.com/profile.php?id=61589957630232`n`n¡Tu apoyo siguiéndonos impulsa nuestro trabajo! Quedamos siempre a tu servicio para cualquier duda o futura obra."
            example = @{
                body_text = @(
                    @( "Oscar" )
                )
            }
        },
        @{
            type = "FOOTER"
            text = "SAUCEDA • Construcción e Inmobiliaria"
        },
        @{
            type = "BUTTONS"
            buttons = @(
                @{
                    type = "URL"
                    text = "Seguir en Instagram"
                    url = "https://www.instagram.com/saucedamx_/"
                },
                @{
                    type = "URL"
                    text = "Visitar Facebook"
                    url = "https://www.facebook.com/profile.php?id=61589957630232"
                }
            )
        }
    )
}

$jsonBody = $plantilla | ConvertTo-Json -Depth 10

Write-Output "Enviando solicitud de registro a Meta Graph API (WABA: $wabaId)..."
$metaUrl = "https://graph.facebook.com/v21.0/$wabaId/message_templates"

try {
    $res = Invoke-RestMethod -Uri $metaUrl -Method Post -Headers @{
        Authorization = "Bearer $token"
        "Content-Type" = "application/json; charset=utf-8"
    } -Body ([System.Text.Encoding]::UTF8.GetBytes($jsonBody))

    Write-Output "✅ Resultado de registro exitoso en Meta:"
    Write-Output ($res | ConvertTo-Json -Depth 5)
} catch {
    Write-Error "❌ Error al registrar plantilla en Meta:"
    Write-Output $_.Exception.Message
    if ($_.ErrorDetails) {
        Write-Output $_.ErrorDetails.Message
    }
}
