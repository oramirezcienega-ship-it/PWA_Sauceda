# Despliegue de Evolution API v2 en Proxmox (Línea Secundaria de Rescate)

Este microservicio permite gestionar una **línea móvil secundaria de WhatsApp Business** para el envío de mensajes libres de rescate fuera de la ventana de 24 horas de Meta.

## 1. Conexión y Despliegue en Proxmox

1. Conéctate a Proxmox (`192.168.100.253` o `100.96.122.113`):
   ```bash
   ssh -p 2222 oscar@100.96.122.113
   ```
2. Crea el directorio del servicio:
   ```bash
   mkdir -p ~/evolution-api
   cd ~/evolution-api
   ```
3. Copia el archivo `docker-compose.yml` y `.env.example` (renómbralo a `.env`).
4. Inicia los contenedores:
   ```bash
   docker compose up -d
   ```
5. Verifica que los servicios estén activos en el puerto `8080`:
   ```bash
   docker compose ps
   curl http://localhost:8080
   ```

## 2. Crear la Instancia de la Línea Secundaria

Para crear la instancia llamada `linea-rescate`:
```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: sauceda_evolution_api_key_2026" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "linea-rescate",
    "token": "sauceda_token_linea_rescate",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

## 3. Vincular el Teléfono Escaneando el Código QR

1. Abre en tu navegador la URL:
   `http://192.168.100.253:8080/instance/connect/linea-rescate`
2. En tu celular con la línea móvil secundaria, ve a WhatsApp Business > **Dispositivos Vinculados** > **Vincular Dispositivo**.
3. Escanea el código QR que aparece en pantalla.
4. Una vez conectado, el CRM de SAUCEDA detectará el estado `open` y podrá enviar mensajes de rescate con 1 clic.
