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
import urllib.request
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
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

def sync():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        print("❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias en .env")
        sys.exit(1)

    if not os.path.exists(SENT_RECORDS_FILE):
        print(f"⚠️ No se encontró el archivo {SENT_RECORDS_FILE}")
        return

    with open(SENT_RECORDS_FILE, "r", encoding="utf-8") as f:
        try:
            records = json.load(f)
        except Exception as e:
            print(f"❌ Error al leer sent_records.json: {e}")
            return

    if not isinstance(records, list):
        print("⚠️ Formato inválido en sent_records.json (se esperaba una lista).")
        return

    print(f"🔍 Evaluando {len(records)} registros en sent_records.json...")

    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json; charset=utf-8",
        "Prefer": "return=minimal",
    }

    insertados = 0
    omitidos = 0
    errores = 0

    for r in records:
        wamid = r.get("wamid")
        phone = r.get("phone") or r.get("telefono")
        if not wamid or not phone:
            omitidos += 1
            continue

        # Verificar si ya existe en mensajes_whatsapp
        check_url = f"{SUPABASE_URL}/rest/v1/mensajes_whatsapp?select=id&wa_message_id=eq.{wamid}&limit=1"
        try:
            req_check = urllib.request.Request(check_url, headers=headers, method="GET")
            with urllib.request.urlopen(req_check, timeout=8) as resp:
                existentes = json.loads(resp.read().decode("utf-8"))
                if existentes and len(existentes) > 0:
                    omitidos += 1
                    continue
        except Exception as e:
            print(f"⚠️ No se pudo verificar WAMID {wamid}: {e}")

        # Preparar registro
        campaign = r.get("campaign") or "Campaña Mautic"
        template = r.get("template") or ""
        first_name = r.get("first_name") or ""
        texto = f"[plantilla: {template}] {first_name}\n[Campaña: {campaign}]".strip()

        payload = {
            "prospecto_id": r.get("prospecto_id"),
            "expediente_id": r.get("expediente_id"),
            "telefono": phone,
            "direccion": "out",
            "texto": texto,
            "wa_message_id": wamid,
            "estado": "enviado",
            "created_at": r.get("timestamp") or datetime.now(timezone.utc).isoformat(),
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
                    print(f"✅ Sincronizado WAMID={wamid} | Tel={phone} | Campaña={campaign}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            if "campana_origen" in err_body:
                # Reintento sin campana_origen
                try:
                    payload_min = {k: v for k, v in payload.items() if k != "campana_origen"}
                    req_min = urllib.request.Request(insert_url, data=json.dumps(payload_min).encode("utf-8"), headers=headers, method="POST")
                    with urllib.request.urlopen(req_min, timeout=10) as resp_m:
                        if resp_m.status in (200, 201, 204):
                            insertados += 1
                            print(f"✅ Sincronizado (sin campana_origen) WAMID={wamid} | Tel={phone}")
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
