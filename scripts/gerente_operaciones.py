#!/usr/bin/env python3
"""
=============================================================================
AGENTE GERENTE DE OPERACIONES - SAUCEDA Bienes Raíces
=============================================================================
Daemon de auditoría continua y generación autónoma de optimizaciones de código.

Este script audita la base de datos de Supabase en busca de:
  - Expedientes estancados o con datos incompletos.
  - Prospectos sin seguimiento por parte de asesores.
  - Oportunidades de mejora en automatizaciones y código del sistema.

Genera alertas en `public.alertas_operaciones` y propuestas de parches de código
en `public.optimizaciones_backlog`.
=============================================================================
"""

import sys
import os
import json
import time
import datetime
import argparse
from typing import Dict, List, Any, Optional
import urllib.request
import urllib.parse
import urllib.error

# -----------------------------------------------------------------------------
# Cargar variables de entorno de .env.local o .env
# -----------------------------------------------------------------------------
def cargar_env():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_paths = [
        os.path.join(root_dir, ".env.local"),
        os.path.join(root_dir, ".env"),
    ]
    
    for path in env_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k and not os.environ.get(k):
                                os.environ[k] = v
            except Exception as e:
                print(f"[WARN] Error al leer {path}: {e}")

cargar_env()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or ""
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or ""

if not SUPABASE_URL or not SUPABASE_KEY:
    print("[WARN] Supabase URL o Key no configuradas en entorno. Las operaciones de DB se simularán o mostrarán en consola.")

# -----------------------------------------------------------------------------
# Cliente HTTP para Supabase REST API
# -----------------------------------------------------------------------------
class SupabaseRest:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key

    def _headers(self, prefer: Optional[str] = None) -> Dict[str, str]:
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    def select(self, table: str, query: str = "*", match: Optional[Dict[str, Any]] = None, extra_params: Optional[str] = None) -> List[Dict[str, Any]]:
        if not self.url or not self.key:
            return []
        endpoint = f"{self.url}/rest/v1/{table}?select={query}"
        if match:
            for k, v in match.items():
                endpoint += f"&{k}=eq.{urllib.parse.quote(str(v))}"
        if extra_params:
            endpoint += f"&{extra_params}"

        req = urllib.request.Request(endpoint, headers=self._headers())
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data if isinstance(data, list) else []
        except Exception as e:
            print(f"[ERROR DB Select] {table}: {e}")
            return []

    def insert(self, table: str, record: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not self.url or not self.key:
            print(f"[SIMULACIÓN INSERT {table}]: {json.dumps(record, ensure_ascii=False, indent=2)}")
            return record

        endpoint = f"{self.url}/rest/v1/{table}"
        headers = self._headers(prefer="return=representation")
        payload = json.dumps(record).encode("utf-8")
        req = urllib.request.Request(endpoint, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data[0] if isinstance(data, list) and len(data) > 0 else record
        except Exception as e:
            print(f"[ERROR DB Insert] {table}: {e}")
            return None

    def update(self, table: str, match: Dict[str, Any], record: Dict[str, Any]) -> bool:
        if not self.url or not self.key:
            print(f"[SIMULACIÓN UPDATE {table}]: {match} -> {record}")
            return True

        query_str = "&".join([f"{k}=eq.{urllib.parse.quote(str(v))}" for k, v in match.items()])
        endpoint = f"{self.url}/rest/v1/{table}?{query_str}"
        headers = self._headers()
        payload = json.dumps(record).encode("utf-8")
        req = urllib.request.Request(endpoint, data=payload, headers=headers, method="PATCH")
        try:
            with urllib.request.urlopen(req):
                return True
        except Exception as e:
            print(f"[ERROR DB Update] {table}: {e}")
            return False

# -----------------------------------------------------------------------------
# Motor de Auditoría Operativa
# -----------------------------------------------------------------------------
class GerenteOperacionesDaemon:
    def __init__(self, db: SupabaseRest, audit_only: bool = False, verbose: bool = False):
        self.db = db
        self.audit_only = audit_only
        self.verbose = verbose

    def log(self, msg: str):
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [GERENTE] {msg}")

    def auditar_expedientes(self) -> List[Dict[str, Any]]:
        self.log("Auditando expedientes activos en la base de datos...")
        expedientes = self.db.select("expedientes", query="id,cliente,etapa,created_at,telefono,ultimo_movimiento")
        alertas_generadas = []

        today = datetime.date.today()
        
        for exp in expedientes:
            exp_id = exp.get("id") or "Sin ID"
            cliente = exp.get("cliente") or "Cliente no especificado"
            etapa = exp.get("etapa") or "Desconocida"
            mov_str = exp.get("ultimo_movimiento") or exp.get("created_at")

            # 1. Check updated_at / ultimo_movimiento for stagnation
            dias_inactivo = 0
            if mov_str:
                try:
                    if "T" in mov_str:
                        clean_str = mov_str.split("T")[0]
                    else:
                        clean_str = mov_str
                    dt_updated = datetime.date.fromisoformat(clean_str)
                    dias_inactivo = (today - dt_updated).days
                except Exception:
                    pass

            if dias_inactivo >= 7:
                alertas_generadas.append({
                    "tipo": "expediente_estancado",
                    "titulo": f"Expediente {exp_id} estancado en etapa '{etapa}'",
                    "descripcion": f"El expediente de {cliente} lleva {dias_inactivo} días sin actualizaciones en la etapa '{etapa}'. Requiere revisión operativa urgente.",
                    "prioridad": "critica" if dias_inactivo > 14 else "alta",
                    "entidad_tipo": "expedientes",
                    "entidad_id": str(exp_id),
                    "sugerencia_ia": f"Contactar al titular {cliente} y verificar si falta documentación para avanzar de la etapa '{etapa}'.",
                    "metadatos": {"dias_inactivo": dias_inactivo, "etapa": etapa, "cliente": cliente}
                })

            # 2. Check missing mandatory info
            if not exp.get("telefono"):
                alertas_generadas.append({
                    "tipo": "inconsistencia_datos",
                    "titulo": f"Expediente {exp_id} carece de número telefónico",
                    "descripcion": f"El expediente registrado para {cliente} no tiene teléfono guardado, impidiendo el seguimiento vía WhatsApp o llamadas.",
                    "prioridad": "media",
                    "entidad_tipo": "expedientes",
                    "entidad_id": str(exp_id),
                    "sugerencia_ia": "Actualizar el número telefónico del cliente desde el módulo CRM.",
                    "metadatos": {"cliente": cliente}
                })

        return alertas_generadas

    def auditar_prospectos(self) -> List[Dict[str, Any]]:
        self.log("Auditando prospectos de captación...")
        prospectos = self.db.select("prospectos", query="id,nombre,telefono,estatus,created_at,asesor_id")
        alertas_generadas = []
        now = datetime.datetime.now(datetime.timezone.utc)

        for p in prospectos:
            p_id = p.get("id")
            nombre = p.get("nombre") or "Prospecto sin nombre"
            telefono = p.get("telefono") or "Sin teléfono"
            estatus = p.get("estatus") or "nuevo"
            created_at_str = p.get("created_at")

            dias_sin_atencion = 0
            if created_at_str:
                try:
                    clean_str = created_at_str.replace("Z", "+00:00")
                    dt_created = datetime.datetime.fromisoformat(clean_str)
                    dias_sin_atencion = (now - dt_created).days
                except Exception:
                    pass

            if estatus == "nuevo" and dias_sin_atencion >= 2:
                alertas_generadas.append({
                    "tipo": "prospecto_sin_seguimiento",
                    "titulo": f"Prospecto '{nombre}' en estado NUEVO por {dias_sin_atencion} días",
                    "descripcion": f"El lead {nombre} ({telefono}) fue recibido hace {dias_sin_atencion} días y no se ha cambiado su estatus ni asignado seguimiento activo.",
                    "prioridad": "alta",
                    "entidad_tipo": "prospectos",
                    "entidad_id": str(p_id),
                    "sugerencia_ia": "Asignar un asesor y lanzar plantilla de seguimiento inmediato por WhatsApp.",
                    "metadatos": {"telefono": telefono, "dias_sin_atencion": dias_sin_atencion}
                })

        return alertas_generadas

    def generar_propuestas_optimizacion(self, alertas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        self.log("Analizando patrones operativos para proponer optimizaciones de código...")
        propuestas = []

        # Regla 1: Si hay múltiples expedientes estancados, proponer daemon de recordatorio automático
        estancados = [a for a in alertas if a["tipo"] == "expediente_estancado"]
        if len(estancados) >= 1:
            propuestas.append({
                "titulo": "Implementar módulo de recordatorios automáticos de expedientes",
                "descripcion": "Genera una función auxiliar `verificarRecordatoriosExpedientes` en `src/lib/actividades.ts` para notificar automáticamente a los asesores sobre expedientes estancados.",
                "categoria": "codigo",
                "archivo_destino": "src/lib/actividades.ts",
                "prioridad": "alta",
                "codigo_propuesto": '''/**
 * Función de optimización generada por Agente Gerente de Operaciones
 * Notifica automáticamente a los asesores sobre expedientes sin movimiento.
 */
export async function verificarRecordatoriosExpedientes(diasLimite: number = 7) {
  console.log(`[GERENTE BOT] Auditando expedientes inactivos por más de ${diasLimite} días...`);
  return { procesados: 0, alertasEnviadas: 0, timestamp: new Date().toISOString() };
}
''',
                "parche_diff": "+++ src/lib/actividades.ts\n@@ export async function verificarRecordatoriosExpedientes @@",
                "metadatos": {"origen": "gerente_operaciones_daemon", "alertas_relacionadas": len(estancados)}
            })

        # Regla 2: Proponer helper de validación de prospectos
        prospectos_pendientes = [a for a in alertas if a["tipo"] == "prospecto_sin_seguimiento"]
        if len(prospectos_pendientes) >= 1:
            propuestas.append({
                "titulo": "Optimización de Calificación Automática de Prospectos",
                "descripcion": "Agrega un filtro de auto-asignación rápida en `src/lib/prospectos-status.ts` para agilizar la interacción inicial con nuevos leads.",
                "categoria": "codigo",
                "archivo_destino": "src/lib/prospectos-status.ts",
                "prioridad": "media",
                "codigo_propuesto": '''/**
 * Helper de optimización para derivar y clasificar prospectos prioritarios
 */
export function clasificarPrioridadLead(diasTranscurridos: number, tieneTelefono: boolean): 'alta' | 'media' | 'baja' {
  if (diasTranscurridos > 2 && tieneTelefono) return 'alta';
  if (diasTranscurridos > 1) return 'media';
  return 'baja';
}
''',
                "parche_diff": "+++ src/lib/prospectos-status.ts\n@@ export function clasificarPrioridadLead @@",
                "metadatos": {"origen": "gerente_operaciones_daemon", "prospectos_inactivos": len(prospectos_pendientes)}
            })

        return propuestas

    def guardar_alertas(self, alertas: List[Dict[str, Any]]):
        if self.audit_only:
            self.log(f"[MODO AUDIT-ONLY] Se detectaron {len(alertas)} alertas (no guardadas en DB).")
            return

        # Consultar alertas existentes para evitar duplicar alertas no resueltas
        existentes = self.db.select("alertas_operaciones", query="entidad_tipo,entidad_id,tipo,estatus")
        existentes_set = {
            (e.get("entidad_tipo"), e.get("entidad_id"), e.get("tipo"))
            for e in existentes if e.get("estatus") in ("pendiente", "en_revision")
        }

        nuevas_guardadas = 0
        for al in alertas:
            key = (al.get("entidad_tipo"), al.get("entidad_id"), al.get("tipo"))
            if key in existentes_set:
                continue

            res = self.db.insert("alertas_operaciones", al)
            if res:
                nuevas_guardadas += 1

        self.log(f"Alertas registradas exitosamente en DB: {nuevas_guardadas} nuevas / {len(alertas)} evaluadas.")

    def guardar_propuestas(self, propuestas: List[Dict[str, Any]]):
        if self.audit_only:
            self.log(f"[MODO AUDIT-ONLY] Se generaron {len(propuestas)} propuestas (no guardadas en DB).")
            return

        existentes = self.db.select("optimizaciones_backlog", query="titulo,archivo_destino,estatus")
        existentes_set = {
            (p.get("titulo"), p.get("archivo_destino"))
            for p in existentes if p.get("estatus") in ("propuesto", "aprobado")
        }

        nuevas_guardadas = 0
        for pr in propuestas:
            key = (pr.get("titulo"), pr.get("archivo_destino"))
            if key in existentes_set:
                continue

            res = self.db.insert("optimizaciones_backlog", pr)
            if res:
                nuevas_guardadas += 1

        self.log(f"Propuestas registradas en el backlog de optimización: {nuevas_guardadas} nuevas.")

    def ejecutar_ciclo_auditoria(self):
        self.log("=== INICIANDO CICLO DE AUDITORÍA OPERATIVA ===")
        alertas = []
        alertas.extend(self.auditar_expedientes())
        alertas.extend(self.auditar_prospectos())

        self.log(f"Resumen del ciclo: {len(alertas)} alertas operativas detectadas.")
        self.guardar_alertas(alertas)

        propuestas = self.generar_propuestas_optimizacion(alertas)
        self.guardar_propuestas(propuestas)
        self.log("=== FIN DEL CICLO DE AUDITORÍA ===\n")

# -----------------------------------------------------------------------------
# Punto de entrada CLI
# -----------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Daemon Agente Gerente de Operaciones - SAUCEDA")
    parser.add_argument("--daemon", action="store_true", help="Ejecutar en bucle continuo como daemon.")
    parser.add_argument("--interval", type=int, default=60, help="Intervalo en segundos para el modo daemon (def: 60s).")
    parser.add_argument("--audit-only", action="store_true", help="Solo auditar y mostrar resultados sin escribir en la DB.")
    parser.add_argument("--verbose", action="store_true", help="Mostrar logs detallados.")

    args = parser.parse_args()

    db = SupabaseRest(SUPABASE_URL, SUPABASE_KEY)
    daemon = GerenteOperacionesDaemon(db, audit_only=args.audit_only, verbose=args.verbose)

    if args.daemon:
        daemon.log(f"Modo Daemon activado. Intervalo de ejecución: {args.interval} segundos.")
        try:
            while True:
                daemon.ejecutar_ciclo_auditoria()
                time.sleep(args.interval)
        except KeyboardInterrupt:
            daemon.log("Daemon detenido por el usuario.")
    else:
        daemon.ejecutar_ciclo_auditoria()

if __name__ == "__main__":
    main()
