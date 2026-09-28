"use client";

import { useState } from "react";
import { crearOrdenTrabajo } from "@/app/actions/ordenes-trabajo";

interface ModalCrearOrdenTrabajoProps {
  abierto: boolean;
  alCerrar: () => void;
  alCrear: (nuevaOT: any) => void;
  expedienteId?: string | null;
  prospectoId?: string | null;
  cotizacionId?: string | null;
  tituloDefault?: string;
  tipoNegocioDefault?: string;
  asesores: Array<{ id: string; nombre: string }>;
}

export function ModalCrearOrdenTrabajo({
  abierto,
  alCerrar,
  alCrear,
  expedienteId,
  prospectoId,
  cotizacionId,
  tituloDefault = "",
  tipoNegocioDefault = "construccion",
  asesores,
}: ModalCrearOrdenTrabajoProps) {
  const [titulo, setTitulo] = useState(tituloDefault || "Trabajos de Ejecución");
  const [tipoNegocio, setTipoNegocio] = useState(tipoNegocioDefault || "construccion");
  const [asesorEjecutorId, setAsesorEjecutorId] = useState("");
  const [fechaProgramada, setFechaProgramada] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [descripcion, setDescripcion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  if (!abierto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      setError("Por favor ingresa un título para la orden de trabajo.");
      return;
    }

    try {
      setCargando(true);
      setError("");

      const res = await crearOrdenTrabajo({
        expedienteId,
        prospectoId,
        cotizacionId,
        tipoNegocio,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        fechaProgramada,
        asesorEjecutorId: asesorEjecutorId || null,
      });

      if (res.ok) {
        alCrear(res);
        alCerrar();
      } else {
        setError(res.error || "No se pudo crear la orden de trabajo.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al procesar la solicitud.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sauce/15 text-xl text-sauce border border-sauce/20">
              🛠️
            </span>
            <div>
              <h3 className="font-titular text-lg font-bold text-verde-profundo">
                Nueva Orden de Trabajo (OT)
              </h3>
              <p className="text-xs text-carbon/60 font-cuerpo">
                Programación de cuadrilla y entrega técnica
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="text-carbon/40 hover:text-carbon text-lg font-bold p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-rojo/10 border border-rojo/20 p-3 text-xs text-rojo font-medium flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-cuerpo">
          <div>
            <label className="block font-semibold text-carbon/80 mb-1">
              Título / Trabajo a Realizar *
            </label>
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Impermeabilización de Azotea 120m²"
              className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-sm text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Línea de Negocio / Especialidad
              </label>
              <select
                value={tipoNegocio}
                onChange={(e) => setTipoNegocio(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white"
              >
                <option value="impermeabilizacion">Impermeabilización</option>
                <option value="mantenimiento_cisternas">Cisternas y Aljibes</option>
                <option value="construccion">Construcción y Remodelación</option>
                <option value="herreria">Herrería y Estructuras</option>
                <option value="piso_estampado">Piso Estampado</option>
                <option value="traspaso_compra">Inmobiliaria / Traspaso</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Fecha Programada
              </label>
              <input
                type="date"
                value={fechaProgramada}
                onChange={(e) => setFechaProgramada(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-carbon/80 mb-1">
              Asesor / Técnico Ejecutor Responsable
            </label>
            <select
              value={asesorEjecutorId}
              onChange={(e) => setAsesorEjecutorId(e.target.value)}
              className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white"
            >
              <option value="">-- Asignar más tarde (Por definir) --</option>
              {asesores.map((a) => (
                <option key={a.id} value={a.id}>
                  👤 {a.nombre}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-carbon/50 mt-1">
              Este asesor recibirá la asignación técnica y liderará la ejecución en sitio.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-carbon/80 mb-1">
              Descripción detallada / Instrucciones para la cuadrilla
            </label>
            <textarea
              rows={3}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalles sobre materiales, acceso al inmueble, horarios pactados con el cliente..."
              className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-carbon/10">
            <button
              type="button"
              onClick={alCerrar}
              disabled={cargando}
              className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-carbon/5 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cargando}
              className="rounded-xl bg-sauce hover:bg-verde-profundo text-white px-5 py-2 text-xs font-bold transition shadow-md flex items-center gap-1.5 disabled:opacity-50"
            >
              {cargando ? "Generando Folio..." : "✓ Crear Orden de Trabajo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
