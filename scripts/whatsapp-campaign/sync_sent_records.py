#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
SINCRONIZADOR RETROACTIVO: sent_records.json -> SUPABASE (mensajes_whatsapp)
=============================================================================
Lee el archivo sent_records.json generado por el receptor de campañas
y registra en public.mensajes_whatsapp todos los envíos que falten.
=============================================================================
"""

import os
import sys
import json
import re
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SENT_RECORDS_FILE = os.path.join(BASE_DIR, "sent_records.json")
ENV_FILE = os.path.join(BASE_DIR, ".env")

# Cargar variables de entorno desde .env si existe
if os.path.exists(ENV_FILE):
    with open(ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip().strip('"').strip("'")

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://odwxrcehbnygxcxmzold.supabase.co").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Cache de busqueda por telefono
ENTITY_CACHE = {}


def consultar_entidad_supabase(phone: str, headers: dict) -> tuple[str | None, str | None]:
    """Busca prospecto_id y expediente_id por los ultimos 10 digitos del telefono."""
    digitos = re.sub(r"\D", "", str(phone))
    sufijo_10 = digitos[-10:] if len(digitos) >= 10 else digitos
    if not sufijo_10 or len(sufijo_10) < 8:
        return None, None
    if sufijo_10 in ENTITY_CACHE:
        return ENTITY_CACHE[sufijo_10]

    # 1. Buscar en prospectos
    try:
        url = f"{SUPABASE_URL}/rest/v1/prospectos?select=id,expediente_id&telefono=ilike.*{sufijo_10}*&limit=1"
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                pid = data[0].get("id")
                eid = data[0].get("expediente_id")
                ENTITY_CACHE[sufijo_10] = (pid, eid)
                return pid, eid
    except Exception:
        pass

    # 2. Buscar en expedientes
    try:
        url = f"{SUPABASE_URL}/rest/v1/expedientes?select=id,prospecto_id&telefono=ilike.*{sufijo_10}*&limit=1"
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                eid = data[0].get("id")
                pid = data[0].get("prospecto_id")
                ENTITY_CACHE[sufijo_10] = (pid, eid)
                return pid, eid
    except Exception:
        pass

    ENTITY_CACHE[sufijo_10] = (None, None)
    return None, None


def sync():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias en .env")
        sys.exit(1)

    if not os.path.exists(SENT_RECORDS_FILE):
        print(f"⚠️ No se encontró el archivo {SENT_RECORDS_FILE}")
        return

    with open(SENT_RECORDS_FILE, "r", encoding="utf-8") as f:
        try:
            raw_records = json.load(f)
        except Exception as e:
            print(f"❌ Error al leer sent_records.json: {e}")
            return

    # Soportar diccionario (formato real en servidor) o lista
    records = []
    seen_wamids = set()
    if isinstance(raw_records, dict):
        for v in raw_records.values():
            if isinstance(v, dict):
                mid = v.get("message_id") or v.get("wamid")
                if mid and mid not in seen_wamids:
                    seen_wamids.add(mid)
                    records.append(v)
    elif isinstance(raw_records, list):
        for v in raw_records:
            if isinstance(v, dict):
                mid = v.get("message_id") or v.get("wamid")
                if mid and mid not in seen_wamids:
                    seen_wamids.add(mid)
                    records.append(v)
    else:
        print("⚠️ Formato inválido en sent_records.json.")
        return

    print(f"🔍 Evaluando {len(records)} registros únicos en sent_records.json...")

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json; charset=utf-8",
        "Prefer": "return=minimal",
    }

    insertados = 0
    omitidos = 0
    errores = 0

    for idx, r in enumerate(records, 1):
        wamid = r.get("message_id") or r.get("wamid")
        phone = r.get("phone") or r.get("telefono")
        if not wamid or not phone:
            omitidos += 1
            continue

        # Verificar si ya existe en mensajes_whatsapp
        check_url = f"{SUPABASE_URL}/rest/v1/mensajes_whatsapp?select=id&wa_message_id=eq.{urllib.parse.quote(wamid)}&limit=1"
        try:
            req_check = urllib.request.Request(check_url, headers=headers, method="GET")
            with urllib.request.urlopen(req_check, timeout=8) as resp:
                existentes = json.loads(resp.read().decode("utf-8"))
                if existentes and len(existentes) > 0:
                    omitidos += 1
                    continue
        except Exception as e:
            print(f"⚠️ No se pudo verificar WAMID {wamid}: {e}")

        # Resolver prospecto y expediente
        prospecto_id = r.get("prospecto_id")
        expediente_id = r.get("expediente_id")
        if not prospecto_id and not expediente_id:
            prospecto_id, expediente_id = consultar_entidad_supabase(phone, headers)

        # Preparar registro
        campaign = r.get("campaign") or "Campaña Mautic"
        template = r.get("template") or ""
        first_name = r.get("clean_name") or r.get("first_name") or r.get("raw_name") or ""
        texto = f"[plantilla: {template}] {first_name}\n[Campaña: {campaign}]".strip()

        created_at = r.get("timestamp") or datetime.now(timezone.utc).isoformat()
        # Asegurar formato ISO timestamp valido
        if created_at and "T" in created_at:
            try:
                dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                created_at = dt.isoformat()
            except Exception:
                created_at = datetime.now(timezone.utc).isoformat()

        payload = {
            "prospecto_id": prospecto_id,
            "expediente_id": expediente_id,
            "telefono": phone,
            "direccion": "out",
            "texto": texto,
            "wa_message_id": wamid,
            "estado": "enviado",
            "created_at": created_at,
            "agente": "Mautic Automatización",
            "campana_origen": campaign,
            "canal_id": "whatsapp",
        }

        insert_url = f"{SUPABASE_URL}/rest/v1/mensajes_whatsapp"
        try:
            req_data = json.dumps(payload).encode("utf-8")
            req_insert = urllib.request.Request(insert_url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req_insert, timeout=10) as resp:
                if resp.status in (200, 201, 204):
                    insertados += 1
                    if insertados % 25 == 0 or insertados == len(records):
                        print(f"[{insertados}/{len(records)}] Sincronizado WAMID={wamid[:25]}... | Tel={phone} | Campaña={campaign}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            if "campana_origen" in err_body:
                # Reintento sin campana_origen si la columna no existiera
                try:
                    payload_min = {k: v for k, v in payload.items() if k != "campana_origen"}
                    req_min = urllib.request.Request(insert_url, data=json.dumps(payload_min).encode("utf-8"), headers=headers, method="POST")
                    with urllib.request.urlopen(req_min, timeout=10) as resp_m:
                        if resp_m.status in (200, 201, 204):
                            insertados += 1
                            continue
                except Exception:
                    pass
            print(f"❌ Error al insertar WAMID {wamid}: {e.code} - {err_body}")
            errores += 1
        except Exception as e:
            print(f"❌ Error inesperado con WAMID {wamid}: {e}")
            errores += 1

    print("\n=============================================")
    print(f"🎉 Sincronización finalizada:")
    print(f"   - Mensajes insertados: {insertados}")
    print(f"   - Ya existentes u omitidos: {omitidos}")
    print(f"   - Errores: {errores}")
    print("=============================================")


if __name__ == "__main__":
    sync()
