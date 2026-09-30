#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
DESPACHADOR DE CAMPAÑAS MAUTIC -> WHATSAPP CLOUD API & CRM SAUCEDA
=============================================================================
Ruta objetivo en servidor Linux: /home/oscar/whatsapp-campaign/webhook_receiver.py
Puerto por defecto: 52900

Flujo de trabajo:
1. Recibe webhooks disparados por campañas de Mautic (JSON o form-data).
2. Encola la petición en un QueueWorker multi-hilo para control de tasa (rate-limit).
3. Envía el mensaje de plantilla (template) a Meta Cloud API (WhatsApp Business).
4. Al recibir el `msg_id` (wamid):
   a) Normaliza el teléfono (últimos 10 dígitos) y consulta Supabase (prospectos/expedientes).
   b) Inserta inmediatamente en `public.mensajes_whatsapp` con:
      - prospecto_id / expediente_id enlazados
      - texto formateado: [plantilla: {template_name}] {first_name}\n[Campaña: {campaign_name}]
      - wa_message_id (wamid devuelto por Meta)
      - campana_origen: {campaign_name}
      - estado: 'enviado'
      - agente: 'Mautic Automatización'
   c) Registra en `sent_records.json` local.
=============================================================================
"""

import os
import sys
import json
import re
import queue
import threading
import logging
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.parse
import urllib.error

# Configuración de Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(threadName)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(os.path.dirname(os.path.abspath(__file__)), "webhook_receiver.log"), encoding="utf-8")
    ]
)
logger = logging.getLogger("MauticWhatsAppDispatcher")

# Variables de entorno con defaults
PORT = int(os.getenv("PORT", "52900"))
HOST = os.getenv("HOST", "0.0.0.0")

# Credenciales de Meta Graph API
META_PHONE_NUMBER_ID = os.getenv("META_PHONE_NUMBER_ID", "390357734170363")
META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
META_GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v20.0")

# Credenciales de Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://supabase-staging.saucedamx.com").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Archivo de registros local
SENT_RECORDS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sent_records.json")

# Cola de tareas de envío
job_queue = queue.Queue()


def normalizar_telefono_crm(raw_phone: str) -> tuple[str, str]:
    """
    Normaliza el número telefónico:
    - Retorna (e164_completo, sufijo_10_digitos)
    Ejemplo: "+52 1 477 123 4567" -> ("5214771234567", "4771234567")
    """
    if not raw_phone:
        return "", ""
    digitos = re.sub(r"\D", "", str(raw_phone))
    sufijo_10 = digitos[-10:] if len(digitos) >= 10 else digitos
    
    # Formato E.164 mexicano para WhatsApp Cloud API
    if len(digitos) == 10:
        e164 = f"521{digitos}"
    elif len(digitos) == 12 and digitos.startswith("52"):
        e164 = f"521{digitos[2:]}"
    elif len(digitos) == 13 and digitos.startswith("521"):
        e164 = digitos
    else:
        e164 = digitos
        
    return e164, sufijo_10


def consultar_entidad_supabase(sufijo_10: str) -> tuple[str | None, str | None]:
    """
    Busca prospecto_id y expediente_id en Supabase por el número telefónico.
    1. Busca en `public.prospectos`
    2. Si no existe, busca en `public.expedientes`
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not sufijo_10:
        return None, None

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
    }

    # 1. Buscar en prospectos
    try:
        query_url = f"{SUPABASE_URL}/rest/v1/prospectos?select=id,expediente_id,telefono&telefono=ilike.*{sufijo_10}*&limit=1"
        req = urllib.request.Request(query_url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                p = data[0]
                prospecto_id = p.get("id")
                expediente_id = p.get("expediente_id")
                logger.info(f"Prospecto encontrado en Supabase: ID={prospecto_id}, Expediente={expediente_id}")
                return prospecto_id, expediente_id
    except Exception as e:
        logger.warning(f"Error al buscar en public.prospectos: {e}")

    # 2. Buscar en expedientes
    try:
        query_url = f"{SUPABASE_URL}/rest/v1/expedientes?select=id,prospecto_id,telefono&telefono=ilike.*{sufijo_10}*&limit=1"
        req = urllib.request.Request(query_url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                exp = data[0]
                expediente_id = exp.get("id")
                prospecto_id = exp.get("prospecto_id")
                logger.info(f"Expediente encontrado en Supabase: ID={expediente_id}, Prospecto={prospecto_id}")
                return prospecto_id, expediente_id
    except Exception as e:
        logger.warning(f"Error al buscar en public.expedientes: {e}")

    logger.info(f"No se encontró prospecto/expediente para el sufijo {sufijo_10} (se registrará como mensaje sin vincular)")
    return None, None


def registrar_mensaje_supabase(
    prospecto_id: str | None,
    expediente_id: str | None,
    telefono_e164: str,
    texto_mensaje: str,
    wamid: str,
    campaign_name: str,
    canal_id: str = "whatsapp"
) -> bool:
    """
    Inserta la fila del mensaje saliente en `public.mensajes_whatsapp` con su trazabilidad de campaña.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados. Omitiendo registro en BD.")
        return False

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json; charset=utf-8",
        "Prefer": "return=minimal",
    }

    payload = {
        "prospecto_id": prospecto_id,
        "expediente_id": expediente_id,
        "telefono": telefono_e164,
        "direccion": "out",
        "texto": texto_mensaje,
        "wa_message_id": wamid,
        "estado": "enviado",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "agente": "Mautic Automatización",
        "campana_origen": campaign_name,
        "canal_id": canal_id,
    }

    try:
        insert_url = f"{SUPABASE_URL}/rest/v1/mensajes_whatsapp"
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(insert_url, data=req_data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status in (200, 201, 204):
                logger.info(f"✅ Mensaje registrado con éxito en mensajes_whatsapp: WAMID={wamid}, Campaña={campaign_name}")
                return True
            else:
                logger.warning(f"Supabase respondió con status {resp.status}")
                return False
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        logger.error(f"Error HTTP al insertar en mensajes_whatsapp: {e.code} - {err_body}")
        return False
    except Exception as e:
        logger.error(f"Excepción al insertar en mensajes_whatsapp: {e}")
        return False


def guardar_registro_local(record: dict):
    """Guarda registro en sent_records.json de forma segura."""
    try:
        records = []
        if os.path.exists(SENT_RECORDS_FILE):
            try:
                with open(SENT_RECORDS_FILE, "r", encoding="utf-8") as f:
                    records = json.load(f)
            except Exception:
                records = []
        records.append(record)
        with open(SENT_RECORDS_FILE, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"No se pudo guardar en sent_records.json: {e}")


def enviar_plantilla_meta(
    phone_e164: str,
    template_name: str,
    language_code: str = "es_MX",
    parameters: list = None
) -> tuple[bool, str | None, dict]:
    """
    Envía la plantilla a través de Meta Graph API.
    Retorna (éxito: bool, msg_id: str | None, meta_response: dict)
    """
    if not META_ACCESS_TOKEN:
        logger.error("META_ACCESS_TOKEN no está configurado.")
        return False, None, {"error": "Token de Meta no configurado"}

    url = f"https://graph.facebook.com/{META_GRAPH_VERSION}/{META_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {META_ACCESS_TOKEN}",
        "Content-Type": "application/json; charset=utf-8",
    }

    components = []
    if parameters and len(parameters) > 0:
        param_components = []
        for p in parameters:
            param_components.append({"type": "text", "text": str(p)})
        components.append({
            "type": "body",
            "parameters": param_components
        })

    payload = {
        "messaging_product": "whatsapp",
        "to": phone_e164,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {
                "code": language_code
            },
        }
    }
    if components:
        payload["template"]["components"] = components

    try:
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=12) as resp:
            resp_body = resp.read().decode("utf-8")
            data = json.loads(resp_body)
            messages = data.get("messages", [])
            if messages and len(messages) > 0:
                wamid = messages[0].get("id")
                return True, wamid, data
            return False, None, data
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8", errors="ignore")
        logger.error(f"Error de Meta API ({e.code}): {err_text}")
        try:
            err_json = json.loads(err_text)
            return False, None, err_json
        except Exception:
            return False, None, {"error": err_text, "code": e.code}
    except Exception as e:
        logger.error(f"Error al llamar a Meta API: {e}")
        return False, None, {"error": str(e)}


def queue_worker():
    """Worker que procesa la cola de envíos de campañas."""
    logger.info("Iniciando Queue Worker de despachos Mautic...")
    while True:
        try:
            job = job_queue.get()
            if job is None:
                break

            phone_raw = job.get("phone") or job.get("telefono") or ""
            first_name = job.get("first_name") or job.get("nombre") or ""
            template_name = job.get("template_name") or job.get("template") or ""
            campaign_name = job.get("campaign_name") or job.get("campaign") or "Campaña Mautic"
            language_code = job.get("language") or "es_MX"
            parameters = job.get("parameters") or []

            # Si parameters está vacío pero se proveyó first_name, usar first_name como primer parámetro
            if not parameters and first_name:
                parameters = [first_name]

            phone_e164, sufijo_10 = normalizar_telefono_crm(phone_raw)
            if not phone_e164:
                logger.warning(f"Teléfono inválido en job: {phone_raw}. Omitiendo.")
                job_queue.task_done()
                continue

            logger.info(f"Procesando envío para {phone_e164} | Plantilla: '{template_name}' | Campaña: '{campaign_name}'")

            # 1. Enviar a Meta Cloud API
            ok, wamid, resp_meta = enviar_plantilla_meta(
                phone_e164=phone_e164,
                template_name=template_name,
                language_code=language_code,
                parameters=parameters
            )

            if ok and wamid:
                logger.info(f"Meta Graph API aceptó el envío. WAMID: {wamid}")

                # 2. Consultar prospecto y expediente en Supabase
                prospecto_id, expediente_id = consultar_entidad_supabase(sufijo_10)

                # 3. Formatear texto con estándar del CRM:
                # [plantilla: {template_name}] {first_name}\n[Campaña: {campaign_name}]
                texto_lineas = [f"[plantilla: {template_name}]"]
                if first_name:
                    texto_lineas.append(first_name)
                texto_formateado = " ".join(texto_lineas).strip() + f"\n[Campaña: {campaign_name}]"

                # 4. Registrar en public.mensajes_whatsapp
                registrar_mensaje_supabase(
                    prospecto_id=prospecto_id,
                    expediente_id=expediente_id,
                    telefono_e164=phone_e164,
                    texto_mensaje=texto_formateado,
                    wamid=wamid,
                    campaign_name=campaign_name,
                    canal_id="whatsapp"
                )

                # 5. Guardar registro local
                guardar_registro_local({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "phone": phone_e164,
                    "first_name": first_name,
                    "template": template_name,
                    "campaign": campaign_name,
                    "wamid": wamid,
                    "prospecto_id": prospecto_id,
                    "expediente_id": expediente_id,
                    "status": "enviado"
                })
            else:
                logger.error(f"Fallo en envío Meta para {phone_e164}: {resp_meta}")
                guardar_registro_local({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "phone": phone_e164,
                    "template": template_name,
                    "campaign": campaign_name,
                    "error": resp_meta,
                    "status": "error"
                })

            job_queue.task_done()
        except Exception as e:
            logger.exception(f"Error no controlado en queue_worker: {e}")
            job_queue.task_done()


class WebhookHandler(BaseHTTPRequestHandler):
    """Maneja las solicitudes HTTP entrantes de Mautic."""

    def _responder_json(self, status_code: int, data: dict):
        response_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_GET(self):
        """Health check endpoint."""
        if self.path in ("/", "/health", "/status"):
            self._responder_json(200, {
                "status": "running",
                "service": "Mautic WhatsApp Campaign Dispatcher",
                "queue_pending": job_queue.qsize(),
                "time": datetime.now(timezone.utc).isoformat()
            })
        else:
            self._responder_json(404, {"error": "Ruta no encontrada"})

    def do_POST(self):
        """Endpoint receptor del webhook de Mautic."""
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        payload = {}
        content_type = self.headers.get("Content-Type", "")

        try:
            if "application/json" in content_type:
                payload = json.loads(post_data.decode("utf-8"))
            elif "application/x-www-form-urlencoded" in content_type:
                parsed = urllib.parse.parse_qs(post_data.decode("utf-8"))
                for k, v in parsed.items():
                    payload[k] = v[0] if len(v) == 1 else v
            else:
                # Intentar parsear como JSON por default
                payload = json.loads(post_data.decode("utf-8"))
        except Exception as e:
            logger.warning(f"Error al decodificar cuerpo POST: {e}")
            self._responder_json(400, {"error": "Cuerpo de solicitud inválido", "detalle": str(e)})
            return

        # Validación básica
        phone = payload.get("phone") or payload.get("telefono")
        template = payload.get("template_name") or payload.get("template")

        if not phone or not template:
            self._responder_json(422, {
                "error": "Campos requeridos faltantes: 'phone' (o 'telefono') y 'template_name' (o 'template').",
                "recibido": payload
            })
            return

        # Encolar para procesamiento asíncrono
        job_queue.put(payload)
        logger.info(f"Webhook recibido y encolado para {phone} (Plantilla: {template}). En cola: {job_queue.qsize()}")

        self._responder_json(202, {
            "status": "enqueued",
            "message": "Mensaje encolado para despacho",
            "queue_position": job_queue.qsize()
        })

    def log_message(self, format, *args):
        # Redirigir logs estándar de BaseHTTPRequestHandler a nuestro logger
        logger.debug("%s - - [%s] %s" % (self.client_address[0], self.log_date_time_string(), format % args))


def main():
    # Cargar archivo .env local si existe
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_file):
        logger.info(f"Cargando configuración desde {env_file}")
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    val = val.strip().strip('"').strip("'")
                    os.environ.setdefault(key.strip(), val)

    # Iniciar hilo de trabajo
    worker_thread = threading.Thread(target=queue_worker, daemon=True, name="QueueWorker-1")
    worker_thread.start()

    # Iniciar servidor HTTP
    server_address = (HOST, PORT)
    httpd = ThreadingHTTPServer(server_address, WebhookHandler)
    logger.info(f"🚀 Despachador Mautic-WhatsApp escuchando en http://{HOST}:{PORT}")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Deteniendo despachador...")
        job_queue.put(None)
        httpd.shutdown()
        logger.info("Servidor detenido.")


if __name__ == "__main__":
    main()
