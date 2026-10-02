# Despachador de Campañas WhatsApp de Mautic hacia CRM Sauceda

Este servicio recibe las llamadas de webhook desde **Mautic** (puerto `52900`), despacha las plantillas autorizadas a través de **Meta Graph API (WhatsApp Cloud API)** y registra automáticamente cada mensaje saliente en la base de datos de **Supabase** enlazándolo al **Prospecto** y **Expediente** del CRM Sauceda.

---

## 🚀 Despliegue en el Servidor (`/home/oscar/whatsapp-campaign/`)

### 1. Copiar los archivos al servidor
Coloca el script `webhook_receiver.py`, `sync_sent_records.py` y el archivo `.env` en tu servidor:
```bash
scp scripts/whatsapp-campaign/webhook_receiver.py oscar@servidor:/home/oscar/whatsapp-campaign/webhook_receiver.py
scp scripts/whatsapp-campaign/sync_sent_records.py oscar@servidor:/home/oscar/whatsapp-campaign/sync_sent_records.py
```

### 2. Configurar `.env`
Crea o edita `/home/oscar/whatsapp-campaign/.env` asegurándote de usar las credenciales de **Producción** (o Staging según corresponda):
```env
PORT=52900
HOST=0.0.0.0
META_PHONE_NUMBER_ID=390357734170363
META_ACCESS_TOKEN=TU_TOKEN_DE_META
SUPABASE_URL=https://crm.saucedamx.com
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

## 🔄 Trazabilidad Automática y Blindaje en el CRM

1. **Envío con Respaldo Doble:**
   - **En el Despachador:** Guarda inmediatamente en `public.mensajes_whatsapp` y en `sent_records.json` local.
   - **En el CRM (Blindaje Automático):** Si por alguna razón el mensaje no se hubiera insertado al momento del despacho, en cuanto Meta notifica `delivered` o `read` a `https://crm.saucedamx.com/api/captacion/whatsapp`, el CRM detecta el mensaje huérfano, localiza el cliente por su teléfono y **lo auto-registra al instante**.
2. **Entrega y Lectura en Tiempo Real:** Cuando Meta envía los webhooks de estatus (`delivered` / `read`), el CRM actualiza automáticamente `entregado_at` y `leido_at` con fecha y hora exactas.
3. **Bandeja de Conversaciones:** Aparece el badge morado `📢 Campaña: {Nombre}` y doble check azul con `Leído a las HH:MM`.
4. **Timeline del Expediente:** En las actividades del cliente aparece `Mensaje de campaña [Nombre] enviado a las XX:XX | Leído a las XX:XX`.
5. **Respuestas:** Cuando el cliente contesta por WhatsApp, continúa fluidamente el hilo sobre esta conversación en la bandeja del CRM.

---

## 📥 Sincronización Retroactiva de Historial Pasado

Si ya enviaste campañas previamente y se acumularon en `sent_records.json` sin haberse insertado en Supabase, ejecuta en el servidor:
```bash
python3 /home/oscar/whatsapp-campaign/sync_sent_records.py
```
El script leerá `sent_records.json`, detectará los mensajes que faltan en `public.mensajes_whatsapp` y los insertará automáticamente.
