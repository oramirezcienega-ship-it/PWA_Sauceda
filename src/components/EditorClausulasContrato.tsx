"use client";

import { useState } from "react";
import { guardarPlantillaClausula } from "@/app/actions/contratos";
import { etiquetaTipoServicio, type TipoServicioContrato } from "@/lib/contratos";

interface Plantilla {
  tipoServicio: string;
  clave: string;
  texto: string;
}

const ETIQUETA_CLAVE: Record<string, string> = {
  prestador_razon_social: "Razón social / nombre del Prestador",
  prestador_rfc: "RFC del Prestador",
  prestador_domicilio: "Domicilio del Prestador",
  anticipo_pct_default: "% de anticipo por defecto",
  duracion_dias_default: "Duración por defecto (días hábiles)",
  clausula_clima: "Cláusula de clima",
  garantia_objeto: "La garantía cubre",
  garantia_exclusiones: "La garantía no cubre (default)",
  exclusiones: "Exclusiones (default)",
  garantia_default: "Garantía por defecto (ej. 3 años)",
};

export function EditorClausulasContrato({ plantillasIniciales }: { plantillasIniciales: Plantilla[] }) {
  const [items, setItems] = useState<Plantilla[]>(plantillasIniciales);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string>("");

  const grupos = Array.from(new Set(items.map((i) => i.tipoServicio)));
  // "general" (datos del prestador y defaults) primero
  grupos.sort((a, b) => (a === "general" ? -1 : b === "general" ? 1 : a.localeCompare(b)));

  const cambiar = (tipo: string, clave: string, texto: string) =>
    setItems((prev) => prev.map((i) => (i.tipoServicio === tipo && i.clave === clave ? { ...i, texto } : i)));

  const guardar = async (p: Plantilla) => {
    const id = `${p.tipoServicio}:${p.clave}`;
    setGuardando(id);
    const r = await guardarPlantillaClausula(p.tipoServicio, p.clave, p.texto);
    setGuardando(null);
    setMensaje(r.ok ? "Guardado." : r.error || "No se pudo guardar.");
  };

  return (
    <div className="space-y-4 font-cuerpo">
      {mensaje && <div className="rounded-xl border border-carbon/10 bg-white p-2.5 text-xs">{mensaje}</div>}
      {grupos.map((tipo) => (
        <details key={tipo} open={tipo === "general"} className="rounded-2xl border border-carbon/10 bg-white p-4">
          <summary className="cursor-pointer font-titular text-sm font-bold text-verde-profundo">
            {tipo === "general" ? "Prestador y valores generales (también cláusulas del tipo General)" : etiquetaTipoServicio(tipo as TipoServicioContrato)}
          </summary>
          <div className="mt-3 space-y-3">
            {items
              .filter((i) => i.tipoServicio === tipo)
              .map((p) => (
                <div key={p.clave}>
                  <label className="block text-xs font-semibold text-carbon/80 mb-1">
                    {ETIQUETA_CLAVE[p.clave] || p.clave}
                  </label>
                  <div className="flex gap-2 items-start">
                    <textarea
                      rows={p.texto.length > 90 ? 3 : 1}
                      value={p.texto}
                      onChange={(e) => cambiar(p.tipoServicio, p.clave, e.target.value)}
                      className="flex-1 rounded-xl border border-carbon/20 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => guardar(p)}
                      disabled={guardando === `${p.tipoServicio}:${p.clave}`}
                      className="bg-verde-profundo text-crema px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </details>
      ))}
    </div>
  );
}
