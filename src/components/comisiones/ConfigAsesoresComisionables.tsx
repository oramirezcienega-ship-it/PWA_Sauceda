"use client";

import { useEffect, useState } from "react";
import {
  actualizarGeneraComisiones,
  listarConfigAsesoresComisiones,
} from "@/app/actions/comisiones";

type Fila = { id: string; nombre: string; rol: string; generaComisiones: boolean };

/** Define qué usuarios generan comisiones por ventas e inspecciones. */
export function ConfigAsesoresComisionables({ alCambiar }: { alCambiar?: () => void }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listarConfigAsesoresComisiones()
      .then(setFilas)
      .catch((e) => setError(e.message || "No se pudieron cargar los usuarios."))
      .finally(() => setCargando(false));
  }, []);

  const alternar = async (fila: Fila) => {
    const valor = !fila.generaComisiones;
    setGuardandoId(fila.id);
    setError("");
    const r = await actualizarGeneraComisiones(fila.id, valor);
    setGuardandoId(null);
    if (!r.ok) {
      setError(r.error || "No se pudo actualizar.");
      return;
    }
    setFilas((prev) => prev.map((f) => (f.id === fila.id ? { ...f, generaComisiones: valor } : f)));
    alCambiar?.();
  };

  return (
    <div className="bg-white border border-carbon/10 rounded-2xl p-5 shadow-xs space-y-3">
      <div>
        <h3 className="font-bold text-sm text-carbon flex items-center gap-2">
          <span>👤</span>
          <span>Usuarios que generan comisiones</span>
        </h3>
        <p className="text-xs text-carbon/60 mt-0.5">
          Solo los usuarios activados generan comisiones por ventas e inspecciones. Las ventas o visitas de los demás no generan comisión.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-rojo/10 border border-rojo/20 p-2 text-xs text-rojo font-medium">⚠️ {error}</div>
      )}

      {cargando ? (
        <p className="text-xs text-carbon/50">Cargando usuarios…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filas.map((f) => (
            <label
              key={f.id}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition ${
                f.generaComisiones ? "border-verde-profundo/40 bg-verde-profundo/5" : "border-carbon/10"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-carbon truncate">{f.nombre}</span>
                <span className="block text-[11px] text-carbon/50 capitalize">{f.rol || "sin rol"}</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-verde-profundo shrink-0"
                checked={f.generaComisiones}
                disabled={guardandoId === f.id}
                onChange={() => alternar(f)}
                aria-label={`${f.nombre} genera comisiones`}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
