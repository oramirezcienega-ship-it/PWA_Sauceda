#!/usr/bin/env python3
"""
=============================================================================
AUTOMATIZADOR DE APLICACIÓN DE PARCHES - SAUCEDA Bienes Raíces
=============================================================================
Este script aplica automáticamente las propuestas de optimización de código
que hayan sido aprobadas por el administrador en `public.optimizaciones_backlog`.

Uso:
  python3 scripts/aplicar_optimizacion.py --id <UUID>
  python3 scripts/aplicar_optimizacion.py --all
  python3 scripts/aplicar_optimizacion.py --dry-run --all
=============================================================================
"""

import sys
import os
import json
import datetime
import argparse
from typing import Dict, List, Any, Optional
import urllib.request
import urllib.parse
import urllib.error

# -----------------------------------------------------------------------------
# Cargar variables de entorno
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

# -----------------------------------------------------------------------------
# Cliente REST de Supabase
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

    def select(self, table: str, query: str = "*", match: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        if not self.url or not self.key:
            return []
        endpoint = f"{self.url}/rest/v1/{table}?select={query}"
        if match:
            for k, v in match.items():
                endpoint += f"&{k}=eq.{urllib.parse.quote(str(v))}"

        req = urllib.request.Request(endpoint, headers=self._headers())
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data if isinstance(data, list) else []
        except Exception as e:
            print(f"[ERROR DB Select] {table}: {e}")
            return []

    def update(self, table: str, match: Dict[str, Any], record: Dict[str, Any]) -> bool:
        if not self.url or not self.key:
            print(f"[SIMULACIÓN DB UPDATE {table}]: match={match} -> payload={record}")
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
# Aplicador de Parches
# -----------------------------------------------------------------------------
class AplicadorOptimizaciones:
    def __init__(self, db: SupabaseRest, dry_run: bool = False):
        self.db = db
        self.dry_run = dry_run
        self.root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def log(self, msg: str):
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [APLICADOR] {msg}")

    def aplicar_optimizacion(self, item: Dict[str, Any]) -> bool:
        opt_id = item.get("id")
        titulo = item.get("titulo", "Sin título")
        archivo_destino = item.get("archivo_destino", "")
        codigo_propuesto = item.get("codigo_propuesto", "")

        if not archivo_destino or not codigo_propuesto:
            self.log(f"[ERROR] La optimización '{titulo}' ({opt_id}) no tiene archivo o código especificado.")
            if not self.dry_run:
                self.db.update(
                    "optimizaciones_backlog",
                    {"id": opt_id},
                    {
                        "estatus": "fallido",
                        "resultado_aplicacion": "Falta archivo_destino o codigo_propuesto en la propuesta."
                    }
                )
            return False

        # Resolver ruta absoluta dentro del proyecto
        full_path = os.path.abspath(os.path.join(self.root_dir, archivo_destino.lstrip("/")))

        # Asegurar que la ruta está dentro del repositorio
        if not full_path.startswith(self.root_dir):
            self.log(f"[ERROR SEGURIDAD] Ruta fuera del proyecto intentada: {full_path}")
            return False

        self.log(f"Procesando propuesta '{titulo}' (ID: {opt_id}) -> Destino: {archivo_destino}")

        if self.dry_run:
            self.log(f"[DRY-RUN] Se aplicaría el siguiente código a {full_path}:\n{codigo_propuesto[:200]}...")
            return True

        try:
            # Crear directorio padre si no existe
            parent_dir = os.path.dirname(full_path)
            os.makedirs(parent_dir, exist_ok=True)

            # Si el archivo existe, concatenar o fusionar código de manera segura
            if os.path.exists(full_path):
                with open(full_path, "r", encoding="utf-8") as f:
                    contenido_actual = f.read()

                # Evitar duplicar si el código exacto ya está presente
                if codigo_propuesto.strip() in contenido_actual:
                    self.log(f"El código de la propuesta ya existe en {archivo_destino}. Marcar como aplicado.")
                    msg_resultado = "El código ya se encontraba integrado en el archivo de destino."
                else:
                    nuevo_contenido = contenido_actual.rstrip() + "\n\n" + codigo_propuesto.strip() + "\n"
                    with open(full_path, "w", encoding="utf-8") as f:
                        f.write(nuevo_contenido)
                    msg_resultado = f"Parche de código fusionado exitosamente en {archivo_destino}."
            else:
                with open(full_path, "w", encoding="utf-8") as f:
                    f.write(codigo_propuesto.strip() + "\n")
                msg_resultado = f"Nuevo archivo creado y parche aplicado en {archivo_destino}."

            self.log(f"[ÉXITO] {msg_resultado}")

            # Actualizar DB
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self.db.update(
                "optimizaciones_backlog",
                {"id": opt_id},
                {
                    "estatus": "aplicado",
                    "fecha_aplicacion": now_iso,
                    "resultado_aplicacion": msg_resultado
                }
            )
            return True

        except Exception as e:
            error_msg = f"Error de E/S al modificar {archivo_destino}: {str(e)}"
            self.log(f"[ERROR] {error_msg}")
            if not self.dry_run:
                self.db.update(
                    "optimizaciones_backlog",
                    {"id": opt_id},
                    {
                        "estatus": "fallido",
                        "resultado_aplicacion": error_msg
                    }
                )
            return False

    def procesar_por_id(self, opt_id: str) -> bool:
        items = self.db.select("optimizaciones_backlog", match={"id": opt_id})
        if not items:
            self.log(f"No se encontró ninguna optimización con ID: {opt_id}")
            return False
        return self.aplicar_optimizacion(items[0])

    def procesar_todos_aprobados(self) -> int:
        items = self.db.select("optimizaciones_backlog", match={"estatus": "aprobado"})
        self.log(f"Optimizaciones aprobadas pendientes de aplicación: {len(items)}")
        exitos = 0
        for item in items:
            if self.aplicar_optimizacion(item):
                exitos += 1
        return exitos

def main():
    parser = argparse.ArgumentParser(description="Aplicador Automático de Optimizaciones - SAUCEDA")
    parser.add_argument("--id", type=str, help="ID específico de la optimización a aplicar.")
    parser.add_argument("--all", action="store_true", help="Aplicar todas las optimizaciones con estatus 'aprobado'.")
    parser.add_argument("--dry-run", action="store_true", help="Simular la aplicación sin modificar archivos ni DB.")

    args = parser.parse_args()

    if not args.id and not args.all:
        parser.print_help()
        sys.exit(1)

    db = SupabaseRest(SUPABASE_URL, SUPABASE_KEY)
    aplicador = AplicadorOptimizaciones(db, dry_run=args.dry_run)

    if args.id:
        aplicador.procesar_por_id(args.id)
    elif args.all:
        aplicador.procesar_todos_aprobados()

if __name__ == "__main__":
    main()
