# Despachador de Campañas WhatsApp de Mautic hacia CRM Sauceda

Este servicio recibe las llamadas de webhook desde **Mautic** (puerto `52900`), despacha las plantillas autorizadas a través de **Meta Graph API (WhatsApp Cloud API)** y registra automáticamente cada mensaje saliente en la base de datos de **Supabase** enlazándolo al **Prospecto** y **Expediente** del CRM Sauceda.

---

## 🚀 Despliegue en el Servidor (`/home/oscar/whatsapp-campaign/`)

### 1. Copiar los archivos
Coloca el script `webhook_receiver.py` y el archivo de configuración `.env` en tu servidor:
```bash
scp scripts/whatsapp-campaign/webhook_receiver.py oscar@servidor:/home/oscar/whatsapp-campaign/webhook_receiver.py
```

### 2. Configurar `.env`
Crea o edita `/home/oscar/whatsapp-campaign/.env`:
```env
PORT=52900
HOST=0.0.0.0
META_PHONE_NUMBER_ID=390357734170363
META_ACCESS_TOKEN=TU_TOKEN_DE_META
SUPABASE_URL=https://supabase-staging.saucedamx.com
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
```

### 3. Ejecutar o Reiniciar el Servicio
Si se administra con `pm2`:
```bash
pm2 restart whatsapp-campaign || pm2 start /home/oscar/whatsapp-campaign/webhook_receiver.py --name whatsapp-campaign --interpreter python3
```

O si se corre con `systemd`:
```bash
sudo systemctl restart whatsapp-campaign.service
```

O en segundo plano:
```bash
nohup python3 /home/oscar/whatsapp-campaign/webhook_receiver.py > /home/oscar/whatsapp-campaign/app.log 2>&1 &
```

---

## 🔄 Trazabilidad Automática en el CRM
1. **Envío:** El mensaje se guarda en `public.mensajes_whatsapp` con `direccion = 'out'`, `campana_origen = {campaign_name}`, `agente = 'Mautic Automatización'` y `wa_message_id = wamid...`.
2. **Entrega y Lectura:** Cuando Meta envía los webhooks de estatus (`delivered` / `read`), Next.js actualiza automáticamente `entregado_at` y `leido_at` con fecha y hora exactas.
3. **Bandeja de Conversaciones:** Aparece el badge morado `📢 Campaña: {Nombre}` y doble check azul con `Leído a las HH:MM`.
4. **Timeline del Expediente:** Aparece en actividades el evento `Mensaje de campaña [Nombre] enviado a las XX:XX | Leído a las XX:XX`.
5. **Respuestas:** Cuando el cliente contesta por WhatsApp, continúa fluidamente el hilo sobre esta conversación en la bandeja del CRM.
