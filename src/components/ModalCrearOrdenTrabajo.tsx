"use client";

import { useEffect, useState } from "react";
import { crearOrdenTrabajo } from "@/app/actions/ordenes-trabajo";
import { listarProveedoresMin } from "@/app/actions/proveedores";

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
  // Expedientes de asesoría de compra o de solo trámite inician una OT de asesoría
  // (el de solo trámite ya tiene casa: se salta búsqueda y negociación).
  const tipoInicial =
    tipoNegocioDefault === "asesoria_compra" || tipoNegocioDefault === "solo_tramite"
      ? "asesoria_compra"
      : tipoNegocioDefault || "construccion";
  const [titulo, setTitulo] = useState(
    tituloDefault || (tipoInicial === "asesoria_compra" ? "Asesoría de compra" : "Trabajos de Ejecución"),
  );
  const [tipoNegocio, setTipoNegocio] = useState(tipoInicial);
  const [yaTieneCasa, setYaTieneCasa] = useState(tipoNegocioDefault === "solo_tramite");
  const esAsesoria = tipoNegocio === "asesoria_compra";
  const [asesorEjecutorId, setAsesorEjecutorId] = useState("");
  const [fechaProgramada, setFechaProgramada] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [descripcion, setDescripcion] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [proveedoresOpciones, setProveedoresOpciones] = useState<{ id: string; nombre: string }[]>([]);
  const [costoProveedor, setCostoProveedor] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!abierto) return;
    listarProveedoresMin().then(setProveedoresOpciones).catch(() => setProveedoresOpciones([]));
  }, [abierto]);

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
        yaTieneCasa: esAsesoria ? yaTieneCasa : undefined,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        fechaProgramada,
        asesorEjecutorId: asesorEjecutorId || null,
        proveedorId: proveedorId || null,
        costoProveedor: costoProveedor ? parseFloat(costoProveedor) : null,
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
                onChange={(e) => {
                  setTipoNegocio(e.target.value);
                  if (e.target.value === "asesoria_compra" && titulo === "Trabajos de Ejecución") setTitulo("Asesoría de compra");
                }}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white"
              >
                <option value="asesoria_compra">Asesoría de compra (comprador)</option>
                <option value="impermeabilizacion">Impermeabilización</option>
                <option value="mantenimiento_cisternas">Cisternas y Aljibes</option>
                <option value="construccion">Construcción y Remodelación</option>
                <option value="herreria">Herrería y Estructuras</option>
                <option value="piso_estampado">Piso Estampado</option>
                <option value="traspaso_compra">Inmobiliaria / Traspaso</option>
                <option value="infonavit_compraventa">Gestión Compraventa INFONAVIT ($15k)</option>
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

          {esAsesoria && (
            <label className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-xs text-carbon/80">
              <input type="checkbox" checked={yaTieneCasa} onChange={(e) => setYaTieneCasa(e.target.checked)} className="mt-0.5" />
              <span>
                <strong>El cliente ya tiene casa.</strong> La orden se salta la búsqueda y la negociación y va directo al
                trámite.
              </span>
            </label>
          )}

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

          <div className="rounded-xl border border-carbon/10 bg-carbon/5 p-3 space-y-3">
            <p className="text-[11px] font-semibold text-carbon/70 uppercase tracking-wide">
              🧾 Proveedor Asignado (Opcional)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-carbon/80 mb-1">Proveedor</label>
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white"
                >
                  <option value="">-- Sin proveedor / Decidir después --</option>
                  {proveedoresOpciones.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-carbon/80 mb-1">Costo Pactado con el Proveedor</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costoProveedor}
                  onChange={(e) => setCostoProveedor(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-sm font-mono text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-carbon/50">
              Al concluir la orden, se generará automáticamente la remisión de este costo a nombre del proveedor.
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
