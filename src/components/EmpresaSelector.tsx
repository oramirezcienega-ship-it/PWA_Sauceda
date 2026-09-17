"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  listarEmpresasMin,
  asociarProspectoAEmpresa,
  asociarNegocioAEmpresa,
} from "@/app/actions/empresas";

interface EmpresaSelectorProps {
  entidadId: string;
  tipoEntidad: "prospecto" | "expediente";
  empresaIdActual?: string | null;
  empresaNombreActual?: string | null;
  onAsignado?: () => void;
}

export function EmpresaSelector({
  entidadId,
  tipoEntidad,
  empresaIdActual,
  empresaNombreActual,
  onAsignado,
}: EmpresaSelectorProps) {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<{ id: string; name: string }[]>([]);
  const [editando, setEditando] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (editando && empresas.length === 0) {
      listarEmpresasMin()
        .then(setEmpresas)
        .catch((err) => console.error("Error al cargar lista de empresas:", err));
    }
  }, [editando, empresas.length]);

  async function cambiarEmpresa(nuevoId: string | null) {
    setCargando(true);
    try {
      if (tipoEntidad === "prospecto") {
        await asociarProspectoAEmpresa(entidadId, nuevoId);
      } else {
        await asociarNegocioAEmpresa(entidadId, nuevoId);
      }
      setEditando(false);
      router.refresh();
      if (onAsignado) onAsignado();
    } catch (err: any) {
      alert("Error al vincular empresa: " + (err?.message || ""));
    } finally {
      setCargando(false);
    }
  }

  if (editando) {
    return (
      <div className="inline-flex items-center gap-1.5 bg-white p-1 rounded-lg border border-carbon/20 shadow-2xs text-xs">
        <span className="text-carbon/50 pl-1">🏢</span>
        <select
          value={empresaIdActual || ""}
          disabled={cargando}
          onChange={(e) => cambiarEmpresa(e.target.value || null)}
          className="rounded border border-carbon/20 bg-white px-2 py-1 text-xs text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
        >
          <option value="">Sin empresa asociada</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="rounded p-1 text-carbon/40 hover:bg-carbon/5 hover:text-carbon"
          title="Cancelar"
        >
          ✕
        </button>
      </div>
    );
  }

  if (empresaIdActual) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 text-xs text-emerald-900 shadow-2xs">
        <span className="text-sm">🏢</span>
        <span className="font-semibold text-carbon/60 text-[11px]">Empresa:</span>
        <Link
          href={`/empresas/${empresaIdActual}`}
          className="font-bold text-emerald-800 hover:text-emerald-950 hover:underline"
        >
          {empresaNombreActual || "Ver Empresa"} ↗
        </Link>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="ml-1 rounded p-0.5 text-emerald-700/60 hover:text-emerald-900 transition"
          title="Cambiar empresa"
        >
          ✏️
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-carbon/25 bg-carbon/5 px-2.5 py-1 text-xs font-semibold text-carbon/60 hover:border-sauce hover:text-sauce hover:bg-sauce/5 transition"
    >
      <span>🏢</span>
      <span>+ Asignar Empresa</span>
    </button>
  );
}
