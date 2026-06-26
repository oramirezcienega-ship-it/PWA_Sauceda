"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listarAsesoresActivos, reasignarAsesor } from "@/app/actions/usuarios";

interface AsesorSelectorProps {
  entidadId: string;
  tipoEntidad: "expediente" | "prospecto";
  asesorIdActual: string | null;
  asesorNombreActual: string | null;
  onAsignado?: () => void;
}

export function AsesorSelector({
  entidadId,
  tipoEntidad,
  asesorIdActual,
  asesorNombreActual,
  onAsignado,
}: AsesorSelectorProps) {
  const router = useRouter();
  const [asesores, setAsesores] = useState<{ id: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (editando && asesores.length === 0) {
      listarAsesoresActivos()
        .then(setAsesores)
        .catch((err) => console.error("Error al cargar asesores:", err));
    }
  }, [editando, asesores.length]);

  async function cambiarAsesor(nuevoId: string | null) {
    setCargando(true);
    try {
      await reasignarAsesor(entidadId, tipoEntidad, nuevoId);
      setEditando(false);
      router.refresh();
      if (onAsignado) onAsignado();
    } catch (err) {
      console.error("Error al reasignar asesor:", err);
      alert("No se pudo reasignar el asesor. Inténtelo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  if (editando) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <select
          value={asesorIdActual || ""}
          disabled={cargando}
          onChange={(e) => cambiarAsesor(e.target.value || null)}
          className="rounded border border-carbon/20 bg-white px-2 py-1 text-xs text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
        >
          <option value="">Sin asesor</option>
          {asesores.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="rounded-md p-1 hover:bg-carbon/5 text-carbon/40 hover:text-carbon"
          title="Cancelar"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded bg-carbon/5 border border-carbon/10 px-2 py-1 text-xs font-semibold text-carbon/75">
        <svg className="h-3 w-3 text-carbon/45" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Asesor: <strong className="font-bold">{asesorNombreActual || "Sin asignar"}</strong>
      </span>
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="rounded-md p-1 hover:bg-carbon/5 text-sauce transition hover:text-verde-profundo"
        title="Asignar o cambiar asesor"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    </div>
  );
}
