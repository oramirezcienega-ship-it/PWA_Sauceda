#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de sincronización masiva (Backfill) a través del Conector RudderStack -> Mautic
para todos los prospectos y expedientes de Impermeabilización en CRM Sauceda Producción.
"""

import os
import sys
import re
import time
import json
import base64
import urllib.request
import urllib.parse
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# 1. Configuración de URLs y Credenciales
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://odwxrcehbnygxcxmzold.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kd3hyY2VoYm55Z3hjeG16b2xkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDAxMTc3MCwiZXhwIjoyMDk1NTg3NzcwfQ.2tq4AHRf-ljySIqoy2cEGntPGJ5VglO0cy6kCgbd0H0")
RUDDERSTACK_URL = os.environ.get("RUDDERSTACK_URL", "http://192.168.100.253:52700/v1/identify")

print("=" * 60)
print("INICIANDO BACKFILL DE IMPERMEABILIZACIÓN AL CONECTOR MAUTIC")
print("=" * 60)
print(f"Supabase URL:    {SUPABASE_URL}")
print(f"RudderStack URL: {RUDDERSTACK_URL}")
print("=" * 60)

sb_headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "User-Agent": "Mozilla/5.0",
    "Range": "0-9999",
    "Prefer": "count=exact"
}

rudder_auth = base64.b64encode(b"crm_source:").decode("utf-8")
rudder_headers = {
    "Content-Type": "application/json",
    "Authorization": f"Basic {rudder_auth}"
}

# 2. Consultar todos los expedientes de impermeabilización
print("\n--> Consultando expedientes de impermeabilización en Supabase...")
exp_url = f"{SUPABASE_URL}/rest/v1/expedientes?select=id,cliente,primer_apellido,segundo_apellido,telefono,etapa,situacion,tipo_negocio,prospecto_id,calificacion,no_viable&tipo_negocio=eq.construccion-impermeabilizacion"
req = urllib.request.Request(exp_url, headers=sb_headers)

try:
    with urllib.request.urlopen(req) as resp:
        expedientes = json.loads(resp.read().decode("utf-8"))
except Exception as e:
    print(f"Error consultando expedientes: {e}")
    sys.exit(1)

print(f"Total expedientes encontrados: {len(expedientes)}")

# 3. Consultar los prospectos asociados
print("\n--> Consultando prospectos en Supabase...")
p_url = f"{SUPABASE_URL}/rest/v1/prospectos?select=id,nombre,primer_apellido,segundo_apellido,telefono,correo,origen,estatus,calificacion,no_viable"
req_p = urllib.request.Request(p_url, headers=sb_headers)

prospectos_map = {}
try:
    with urllib.request.urlopen(req_p) as resp_p:
        pros_data = json.loads(resp_p.read().decode("utf-8"))
        for p in pros_data:
            prospectos_map[p["id"]] = p
except Exception as e:
    print(f"Error consultando prospectos: {e}")

print(f"Prospectos cargados en memoria: {len(prospectos_map)}")

# 4. Procesar y transmitir cada registro a través del conector
calificados = 0
descalificados = 0
errores = 0

print("\n--> Transmitiendo contactos a través del conector RudderStack -> Mautic...")

for i, exp in enumerate(expedientes, 1):
    p_id = exp.get("prospecto_id")
    pros = prospectos_map.get(p_id) if p_id else None

    user_id = p_id or f"exp-{exp['id']}"
    firstname = (pros.get("nombre") if pros else None) or exp.get("cliente") or "Cliente"
    
    p_ape = (pros.get("primer_apellido") if pros else None) or exp.get("primer_apellido") or ""
    s_ape = (pros.get("segundo_apellido") if pros else None) or exp.get("segundo_apellido") or ""
    lastname = " ".join([p for p in [p_ape, s_ape] if p]).strip()

    raw_phone = (pros.get("telefono") if pros else None) or exp.get("telefono") or ""
    digits = re.sub(r'\D', '', raw_phone)
    clean_phone = digits[-10:] if len(digits) >= 10 else ""

    raw_email = (pros.get("correo") if pros else None) or ""
    clean_email = raw_email.strip().lower() if ("@" in raw_email and "." in raw_email) else ""
    
    origen = (pros.get("origen") if pros else None) or "crm"

    etapa = exp.get("etapa") or "nuevo-lead"
    estatus = (pros.get("estatus") if pros else None) or "activo"
    
    exp_calif = exp.get("calificacion")
    pros_calif = pros.get("calificacion") if pros else None
    calif_raw = exp_calif or pros_calif or "templado"

    no_viable = bool(exp.get("no_viable")) or (bool(pros.get("no_viable")) if pros else False)

    # Regla estricta de descalificación
    etapa_l = etapa.lower()
    estatus_l = estatus.lower()
    calif_l = str(calif_raw).lower()

    es_descalificado = (
        etapa_l in ["perdido", "descalificado", "no_viable", "no-viable", "fuera_de_zona", "fuera-de-zona"] or
        estatus_l in ["no_viable", "sin_contacto", "descalificado"] or
        calif_l == "descalificado" or
        no_viable is True
    )

    if es_descalificado:
        descalificados += 1
        calificacion_final = "descalificado"
    else:
        calificados += 1
        calificacion_final = calif_raw if calif_raw != "descalificado" else "templado"

    tags = ["construccion-impermeabilizacion", "impermeabilizacion"]
    if es_descalificado:
        tags.append("descalificado")

    traits = {
        "firstname": firstname.strip(),
        "lastname": lastname.strip(),
        "origen": origen,
        "tipo_negocio": "construccion-impermeabilizacion",
        "etapa": etapa,
        "estatus": estatus,
        "calificacion": calificacion_final,
        "no_viable": no_viable,
        "descalificado": 1 if es_descalificado else 0,
        "tags": ",".join(tags)
    }

    if clean_phone:
        traits["phone"] = clean_phone
    if clean_email:
        traits["email"] = clean_email

    payload = {
        "userId": user_id,
        "type": "identify",
        "traits": traits,
        "context": {
            "library": {
                "name": "crm-sauceda-backfill",
                "version": "2.0.0"
            }
        }
    }

    try:
        data_bytes = json.dumps(payload).encode("utf-8")
        req_rudder = urllib.request.Request(
            RUDDERSTACK_URL,
            data=data_bytes,
            headers=rudder_headers,
            method="POST"
        )
        with urllib.request.urlopen(req_rudder, timeout=5) as r_resp:
            if r_resp.status != 200:
                print(f"[{i}/{len(expedientes)}] Aviso HTTP {r_resp.status} para {user_id}")
    except Exception as e:
        print(f"[{i}/{len(expedientes)}] Error transmitiendo {user_id}: {e}")
        errores += 1

    time.sleep(0.01)

print("\n" + "=" * 60)
print("RESUMEN DE SINCRONIZACIÓN (BACKFILL)")
print("=" * 60)
print(f"Total procesados:       {len(expedientes)}")
print(f"✅ Calificados activos: {calificados} (entran al segmento)")
print(f"🚫 Descalificados:      {descalificados} (quedan excluidos)")
print(f"❌ Errores de envío:    {errores}")
print("=" * 60)
print("¡El conector RudderStack -> Mautic ha finalizado con éxito!")
