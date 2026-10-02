#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
DESPACHADOR DE CAMPAÑAS MAUTIC -> WHATSAPP CLOUD API & CRM SAUCEDA
=============================================================================
Ruta objetivo en servidor Linux: /home/oscar/whatsapp-campaign/webhook_receiver.py
Puerto por defecto: 52900

Flujo de trabajo:
1. Recibe webhooks disparados por campañas de Mautic (JSON o form-data, query params).
2. Encola la petición en un QueueWorker multi-hilo para control de tasa (rate-limit 3s).
3. Envía el mensaje de plantilla (template) a Meta Cloud API (WhatsApp Business) con soporte de header media_id.
4. Al recibir el `msg_id` (wamid):
   a) Normaliza el teléfono (últimos 10 dígitos) y consulta Supabase (prospectos/expedientes).
   b) Inserta inmediatamente en `public.mensajes_whatsapp` con:
      - prospecto_id / expediente_id enlazados
      - texto formateado: [plantilla: {template_name}] {first_name}\n[Campaña: {campaign_name}]
      - wa_message_id (wamid devuelto por Meta)
      - campana_origen: {campaign_name}
      - estado: 'enviado'
      - agente: 'Mautic Automatización'
   c) Registra en `sent_records.json` local (formato dict retrocompatible).
=============================================================================
"""

import os
import sys
import json
import re
import queue
import threading
import logging
import time
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import urllib.request
import urllib.parse
import urllib.error

# Cargar archivo .env local si existe ANTES de leer variables de entorno
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(BASE_DIR, ".env")
if os.path.exists(ENV_FILE):
    try:
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    os.environ[key.strip()] = val.strip().strip('"').strip("'")
    except Exception as e:
        print(f"Error cargando .env: {e}")

# Configuración de Logging
LOG_FILE = os.path.join(BASE_DIR, "campaign.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(threadName)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, encoding="utf-8")
    ]
)
logger = logging.getLogger("MauticWhatsAppDispatcher")

# Variables de entorno con defaults de producción
PORT = int(os.getenv("PORT", "52900"))
HOST = os.getenv("HOST", "0.0.0.0")

# Credenciales de Meta Graph API
META_PHONE_NUMBER_ID = os.getenv("META_PHONE_NUMBER_ID", "1186997567823002")
META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN", "")
META_GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v21.0")

# Credenciales de Supabase
raw_supabase_url = os.getenv("SUPABASE_URL", "https://odwxrcehbnygxcxmzold.supabase.co").rstrip("/")
# Si por error se pasó la URL del frontend del CRM, redirigir a Supabase Cloud real
if "crm.saucedamx.com" in raw_supabase_url:
    raw_supabase_url = "https://odwxrcehbnygxcxmzold.supabase.co"
SUPABASE_URL = raw_supabase_url
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Archivo de registros local
SENT_RECORDS_FILE = os.path.join(BASE_DIR, "sent_records.json")

# Cola de tareas de envío y control de duplicados en cola
job_queue = queue.Queue()
queued_keys = set()
lock = threading.Lock()


def load_sent_records() -> dict:
    if os.path.exists(SENT_RECORDS_FILE):
        try:
            with open(SENT_RECORDS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return {}


def save_sent_record(dedup_key: str, phone: str, data: dict):
    with lock:
        records = load_sent_records()
        records[dedup_key] = data
        records[phone] = data
        try:
            with open(SENT_RECORDS_FILE, "w", encoding="utf-8") as f:
                json.dump(records, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Error guardando sent_records.json: {e}")


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

    if len(digitos) == 10:
        e164 = f"521{digitos}"
    elif len(digitos) == 12 and digitos.startswith("52"):
        e164 = f"521{digitos[2:]}"
    elif len(digitos) == 13 and digitos.startswith("521"):
        e164 = digitos
    elif len(digitos) >= 11:
        e164 = digitos
    else:
        e164 = ""

    return e164, sufijo_10


def clean_name(raw_name: str) -> str:
    if not raw_name:
        return ""
    clean = re.sub(r"[^\w\sÁÉÍÓÚáéíóúÑñÜü]", "", str(raw_name)).strip()
    if not clean:
        return ""
    parts = clean.split()
    first = parts[0].capitalize()
    if len(first) < 2 or first.lower() in ["de", "la", "el", "los", "las", "lead", "prospecto"]:
        if len(parts) > 1:
            return f"{first} {parts[1].capitalize()}"
        return ""
    return first


def consultar_entidad_supabase(sufijo_10: str) -> tuple[str | None, str | None]:
    """
    Busca prospecto_id y expediente_id en Supabase por el número telefónico.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not sufijo_10 or len(sufijo_10) < 8:
        return None, None

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Accept": "application/json",
    }

    # 1. Buscar en prospectos
    try:
        query_url = f"{SUPABASE_URL}/rest/v1/prospectos?select=id,expediente_id&telefono=ilike.*{sufijo_10}*&limit=1"
        req = urllib.request.Request(query_url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                pid = data[0].get("id")
                eid = data[0].get("expediente_id")
                logger.info(f"Prospecto encontrado en Supabase: ID={pid}, Expediente={eid}")
                return pid, eid
    except Exception as e:
        logger.debug(f"Búsqueda prospecto: {e}")

    # 2. Buscar en expedientes
    try:
        query_url = f"{SUPABASE_URL}/rest/v1/expedientes?select=id,prospecto_id&telefono=ilike.*{sufijo_10}*&limit=1"
        req = urllib.request.Request(query_url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                eid = data[0].get("id")
                pid = data[0].get("prospecto_id")
                logger.info(f"Expediente encontrado en Supabase: ID={eid}, Prospecto={pid}")
                return pid, eid
    except Exception as e:
        logger.debug(f"Búsqueda expediente: {e}")

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
            return False
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        if "campana_origen" in err_body:
            try:
                payload_fallback = {k: v for k, v in payload.items() if k != "campana_origen"}
                req_fallback = urllib.request.Request(insert_url, data=json.dumps(payload_fallback).encode("utf-8"), headers=headers, method="POST")
                with urllib.request.urlopen(req_fallback, timeout=10) as resp_fb:
                    if resp_fb.status in (200, 201, 204):
                        logger.info(f"✅ Mensaje registrado (fallback sin campana_origen): WAMID={wamid}")
                        return True
            except Exception as e_fb:
                logger.error(f"Error en fallback sin campana_origen: {e_fb}")
        logger.error(f"Error HTTP al insertar en mensajes_whatsapp: {e.code} - {err_body}")
        return False
    except Exception as e:
        logger.error(f"Excepción al insertar en mensajes_whatsapp: {e}")
        return False


def enviar_plantilla_meta(
    phone_e164: str,
    template_name: str,
    first_name: str = "",
    media_id: str | None = None,
    language_code: str = "es_MX"
) -> tuple[bool, str | None, dict]:
    """
    Envía la plantilla a través de Meta Graph API.
    Soporta opcionalmente header de imagen (media_id) y variable de body {{1}} (nombre).
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
    # Header de imagen si la plantilla lo requiere
    if media_id and str(media_id).strip().lower() not in ("none", "null", "false", "", "0"):
        components.append({
            "type": "header",
            "parameters": [
                {
                    "type": "image",
                    "image": {
                        "id": str(media_id).strip()
                    }
                }
            ]
        })

    # Variable {{1}} para el nombre en el cuerpo del mensaje
    if first_name and template_name != "hello_world":
        components.append({
            "type": "body",
            "parameters": [
                {
                    "type": "text",
                    "text": first_name
                }
            ]
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
        with urllib.request.urlopen(req, timeout=15) as resp:
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
            return False, None, json.loads(err_text)
        except Exception:
            return False, None, {"error": err_text, "code": e.code}
    except Exception as e:
        logger.error(f"Error al llamar a Meta API: {e}")
        return False, None, {"error": str(e)}


def queue_worker():
    """Worker que procesa la cola de envíos de campañas espaciando cada 3 segundos."""
    logger.info("Iniciando Queue Worker de despachos Mautic...")
    while True:
        try:
            job = job_queue.get()
            if job is None:
                break

            phone_raw = job.get("phone") or job.get("telefono") or job.get("mobile") or ""
            raw_name = job.get("first_name") or job.get("firstname") or job.get("nombre") or ""
            name = clean_name(raw_name) or "cliente"
            template_name = job.get("template_name") or job.get("template") or ""
            campaign_name = job.get("campaign_name") or job.get("campaign") or "Campaña Mautic"
            media_id = job.get("media_id")
            dedup_key = job.get("dedup_key") or f"{campaign_name}:{phone_raw}"
            language_code = job.get("language") or ("en_US" if template_name == "hello_world" else "es_MX")

            phone_e164, sufijo_10 = normalizar_telefono_crm(phone_raw)
            if not phone_e164:
                logger.warning(f"Teléfono inválido en job: '{phone_raw}'. Omitiendo.")
                job_queue.task_done()
                continue

            logger.info(f"[DISPATCHING] Campaign='{campaign_name}' | Template='{template_name}' | To={phone_e164} ({name}) | En cola: {job_queue.qsize()}")

            # 1. Enviar a Meta Cloud API
            ok, wamid, resp_meta = enviar_plantilla_meta(
                phone_e164=phone_e164,
                template_name=template_name,
                first_name=name,
                media_id=media_id,
                language_code=language_code
            )

            record_entry = {
                "lead_id": job.get("lead_id"),
                "campaign": campaign_name,
                "template": template_name,
                "raw_name": raw_name,
                "clean_name": name,
                "phone": phone_e164,
                "status": "sent" if ok else "failed",
                "message_id": wamid,
                "response": resp_meta,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            if ok and wamid:
                logger.info(f"✅ [SUCCESS] Enviado a {phone_e164} ({name})! WAMID: {wamid}")

                # 2. Consultar prospecto y expediente en Supabase
                prospecto_id, expediente_id = consultar_entidad_supabase(sufijo_10)
                record_entry["prospecto_id"] = prospecto_id
                record_entry["expediente_id"] = expediente_id

                # 3. Formatear texto con estándar del CRM Sauceda
                header_tag = f"[image:{media_id}] " if media_id else ""
                texto_formateado = f"{header_tag}[plantilla: {template_name}] {name}\n[Campaña: {campaign_name}]".strip()

                # 4. Registrar en public.mensajes_whatsapp para trazabilidad y doble check
                registrar_mensaje_supabase(
                    prospecto_id=prospecto_id,
                    expediente_id=expediente_id,
                    telefono_e164=phone_e164,
                    texto_mensaje=texto_formateado,
                    wamid=wamid,
                    campaign_name=campaign_name,
                    canal_id="whatsapp"
                )
            else:
                logger.error(f"❌ [FAILURE] Falló envío a {phone_e164} ({name}): {resp_meta}")

            # 5. Guardar registro local
            save_sent_record(dedup_key, phone_e164, record_entry)

            job_queue.task_done()
            time.sleep(3.0)  # Pacing 1 mensaje cada 3 segundos
        except Exception as e:
            logger.error(f"Worker exception: {e}")
            time.sleep(1.0)


class WebhookHandler(BaseHTTPRequestHandler):
    def _responder_json(self, status: int, data: dict):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8"))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/status", "/health"):
            records = load_sent_records()
            campaign_stats = {}
            for r in records.values():
                if not isinstance(r, dict):
                    continue
                camp = r.get("campaign", "default")
                if camp not in campaign_stats:
                    campaign_stats[camp] = {"sent": 0, "failed": 0}
                if r.get("status") == "sent":
                    campaign_stats[camp]["sent"] += 1
                elif r.get("status") == "failed":
                    campaign_stats[camp]["failed"] += 1

            total_sent = sum(1 for r in records.values() if isinstance(r, dict) and r.get("status") == "sent")
            total_failed = sum(1 for r in records.values() if isinstance(r, dict) and r.get("status") == "failed")

            self._responder_json(200, {
                "status": "online",
                "service": "Mautic WhatsApp Campaign Dispatcher",
                "phone_number_id": META_PHONE_NUMBER_ID,
                "supabase_url": SUPABASE_URL,
                "queue_remaining": job_queue.qsize(),
                "successful_sent": total_sent,
                "failed": total_failed,
                "campaigns": campaign_stats,
                "time": datetime.now(timezone.utc).isoformat()
            })
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"WhatsApp Cloud API Webhook Receiver Active")

    def do_POST(self):
        """Endpoint receptor del webhook de Mautic."""
        parsed_url = urllib.parse.urlparse(self.path)
        qparams = urllib.parse.parse_qs(parsed_url.query)

        # Extraer parámetros de query string
        is_legacy = self.path.startswith("/webhook/whatsapp-impermeabilizacion")
        campaign_name = qparams.get("campaign", ["reactivacion_impermeabilizacion" if is_legacy else None])[0]
        template_name = qparams.get("template", [None])[0]
        media_id = qparams.get("media_id", [None])[0]

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"

        raw_data = {}
        content_type = self.headers.get("Content-Type", "")

        try:
            if "application/json" in content_type:
                raw_data = json.loads(body)
            elif "application/x-www-form-urlencoded" in content_type:
                parsed_body = urllib.parse.parse_qs(body)
                for k, v in parsed_body.items():
                    raw_data[k] = v[0] if v else ""
            elif body.strip().startswith("{"):
                raw_data = json.loads(body)
        except Exception as e:
            logger.warning(f"Error decodificando payload: {e}")

        # Permitir que el body sobreescriba parámetros o use valores de query
        campaign_name = raw_data.get("campaign") or raw_data.get("campaign_name") or campaign_name or "Campaña Mautic"
        template_name = raw_data.get("template") or raw_data.get("template_name") or template_name
        media_id = raw_data.get("media_id") if "media_id" in raw_data else media_id

        lead_id = raw_data.get("lead_id") or raw_data.get("id") or raw_data.get("contact", {}).get("id")
        raw_name = raw_data.get("firstname") or raw_data.get("first_name") or raw_data.get("name") or ""
        raw_phone = raw_data.get("phone") or raw_data.get("telefono") or raw_data.get("mobile") or ""

        phone_e164, _ = normalizar_telefono_crm(raw_phone)
        if not phone_e164:
            logger.warning(f"[{campaign_name}] Teléfono inválido: '{raw_phone}'. Omitiendo.")
            self._responder_json(200, {"status": "skipped", "reason": "invalid_phone"})
            return

        if not template_name:
            logger.warning(f"[{campaign_name}] Falta template para {phone_e164}.")
            self._responder_json(422, {"status": "error", "reason": "missing_template"})
            return

        dedup_key = f"{campaign_name}:{phone_e164}"

        # Deduplicación contra ya enviados
        records = load_sent_records()
        if dedup_key in records and records[dedup_key].get("status") == "sent":
            logger.info(f"[{campaign_name}] {phone_e164} ya enviado anteriormente. Deduplicando.")
            self._responder_json(200, {"status": "skipped", "reason": "already_sent"})
            return

        # Deduplicación contra en cola
        with lock:
            if dedup_key in queued_keys:
                logger.info(f"[{campaign_name}] {phone_e164} ya está en cola. Deduplicando.")
                self._responder_json(200, {"status": "skipped", "reason": "already_queued"})
                return
            queued_keys.add(dedup_key)

        # Encolar para envío
        payload_job = {
            "phone": phone_e164,
            "raw_name": raw_name,
            "first_name": clean_name(raw_name),
            "lead_id": lead_id,
            "campaign": campaign_name,
            "campaign_name": campaign_name,
            "template": template_name,
            "template_name": template_name,
            "media_id": media_id,
            "dedup_key": dedup_key
        }
        job_queue.put(payload_job)
        logger.info(f"[ENQUEUED] Campaign='{campaign_name}' | Template='{template_name}' | To={phone_e164} ({raw_name}). En cola: {job_queue.qsize()}")

        self._responder_json(202, {
            "status": "queued",
            "campaign": campaign_name,
            "phone": phone_e164,
            "template": template_name,
            "media_id": media_id,
            "queue_position": job_queue.qsize()
        })

    def log_message(self, format, *args):
        return


def main():
    worker = threading.Thread(target=queue_worker, daemon=True, name="QueueWorker-1")
    worker.start()

    server = ThreadingHTTPServer((HOST, PORT), WebhookHandler)
    logger.info(f"🚀 Despachador Multi-Campaña WhatsApp escuchando en http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Deteniendo servidor...")
        server.shutdown()


if __name__ == "__main__":
    main()
