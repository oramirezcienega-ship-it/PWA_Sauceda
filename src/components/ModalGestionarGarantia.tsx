"use client";

import { useEffect, useState } from "react";
import {
  guardarGarantiaOT,
  regenerarGarantiaDesdeProducto,
  listarEntregadoresGarantia,
  type CartaGarantiaOT,
} from "@/app/actions/ordenes-trabajo";

interface ModalGestionarGarantiaProps {
  abierto: boolean;
  alCerrar: () => void;
  alGuardar: (garantia: CartaGarantiaOT) => void;
  ordenId: string;
  ordenFolio: string;
  clienteNombre: string;
  clienteTelefono?: string;
  garantiaActual: CartaGarantiaOT | null;
  tipoNegocio: string;
  /** Asesor ejecutor de la orden: es quien entrega la instalación por defecto. */
  asesorEjecutorId?: string | null;
  asesorEjecutorNombre?: string | null;
}

export function ModalGestionarGarantia({
  abierto,
  alCerrar,
  alGuardar,
  ordenId,
  ordenFolio,
  clienteNombre,
  clienteTelefono,
  garantiaActual,
  tipoNegocio,
  asesorEjecutorId,
  asesorEjecutorNombre,
}: ModalGestionarGarantiaProps) {
  const defaultAnos = garantiaActual?.anosGarantia || (tipoNegocio === "impermeabilizacion" ? 3 : 1);
  const defaultFechaInicio =
    garantiaActual?.fechaInicio || new Date().toISOString().split("T")[0];

  const generarTextoPorDefecto = (anos: number) => {
    return `PÓLIZA DE GARANTÍA POR SERVICIO TÉCNICO

Folio de Orden de Trabajo: ${ordenFolio}
Cliente Beneficiario: ${clienteNombre}
Vigencia: ${anos} año(s) a partir de la fecha de entrega

SAUCEDA SOLUCIONES INMOBILIARIAS Y CONSTRUCCIÓN garantiza que los trabajos realizados correspondientes a la Orden de Trabajo ${ordenFolio} han sido ejecutados conforme a las mejores prácticas de ingeniería, especificaciones técnicas de materiales y mano de obra calificada.

COBERTURA DE LA GARANTÍA:
1. Esta póliza ampara cualquier vicio oculto o falla de aplicación derivada directamente de los materiales aplicados o mano de obra ejecutada.
2. Durante el periodo de vigencia, Sauceda realizará las inspecciones y reparaciones correctivas pertinentes sin costo adicional de mano de obra en caso de defecto técnico comprobado.

CONDICIONES Y EXCLUSIONES:
- Daños causados por fenómenos naturales extraordinarios (sismos, inundaciones, granizadas atípicas).
- Modificaciones, perforaciones, paso de instalaciones o intervenciones realizadas por personal ajeno a Sauceda posterior a la entrega.
- Mal uso, desgaste por tráfico no previsto o falta de mantenimiento preventivo acordado.

Atentamente,
Departamento de Control de Calidad y Operaciones
Sauceda Construye · León, Guanajuato`;
  };

  const [titulo, setTitulo] = useState(
    garantiaActual?.titulo || "Póliza de Garantía por Servicio"
  );
  const [anosGarantia, setAnosGarantia] = useState<number>(defaultAnos);
  const [fechaInicio, setFechaInicio] = useState(defaultFechaInicio);
  const [contenido, setContenido] = useState(
    garantiaActual?.contenido || generarTextoPorDefecto(defaultAnos)
  );
  // Asesor que entrega la instalación y nombre completo con el que firma la póliza
  const [entregadores, setEntregadores] = useState<{ id: string; nombre: string; nombreCompleto: string }[]>([]);
  const [entregadoPorId, setEntregadoPorId] = useState<string>(garantiaActual?.entregadoPorId || asesorEjecutorId || "");
  const [entregadoPorNombre, setEntregadoPorNombre] = useState<string>(
    garantiaActual?.entregadoPorNombre || asesorEjecutorNombre || ""
  );
  const [cargando, setCargando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [error, setError] = useState("");
  const [garantiaGuardada, setGarantiaGuardada] = useState<CartaGarantiaOT | null>(
    garantiaActual
  );

  useEffect(() => {
    if (!abierto) return;
    listarEntregadoresGarantia().then((lista) => {
      setEntregadores(lista);
      // Si aún no hay nombre completo guardado en la póliza, precarga el del perfil
      if (!garantiaActual?.entregadoPorNombre) {
        const p = lista.find((x) => x.id === entregadoPorId);
        if (p) setEntregadoPorNombre(p.nombreCompleto || p.nombre);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const handleCambiarEntregador = (id: string) => {
    setEntregadoPorId(id);
    const p = entregadores.find((x) => x.id === id);
    setEntregadoPorNombre(p ? p.nombreCompleto || p.nombre : "");
  };

  if (!abierto) return null;

  const handleCambiarAnos = (nuevosAnos: number) => {
    setAnosGarantia(nuevosAnos);
    if (!garantiaActual) {
      setContenido(generarTextoPorDefecto(nuevosAnos));
    }
  };

  const handleRegenerarDesdeProducto = async () => {
    if (
      !window.confirm(
        "Se reemplazará el texto, el título y la vigencia de la póliza con la plantilla actual del producto vendido. ¿Continuar?"
      )
    ) {
      return;
    }
    try {
      setRegenerando(true);
      setError("");
      const res = await regenerarGarantiaDesdeProducto(ordenId);
      if (res.ok && res.garantia) {
        setContenido(res.garantia.contenido);
        setTitulo(res.garantia.titulo);
        setAnosGarantia(res.garantia.anosGarantia);
        setGarantiaGuardada(res.garantia);
        if (res.usoPlantillaProducto === false) {
          setError(
            "El producto vendido no tiene plantilla de garantía en el catálogo; se usó el texto genérico con la descripción de la cotización."
          );
        }
        alGuardar(res.garantia);
      } else {
        setError(res.error || "No se pudo regenerar la póliza.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al regenerar la póliza.");
    } finally {
      setRegenerando(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contenido.trim()) {
      setError("El contenido de la póliza de garantía no puede estar vacío.");
      return;
    }

    try {
      setCargando(true);
      setError("");

      const res = await guardarGarantiaOT({
        ordenTrabajoId: ordenId,
        titulo: titulo.trim(),
        contenido: contenido.trim(),
        anosGarantia,
        fechaInicio,
        entregadoPorId: entregadoPorId || null,
        entregadoPorNombre: entregadoPorNombre.trim() || null,
      });

      if (res.ok && res.garantia) {
        setGarantiaGuardada(res.garantia);
        alGuardar(res.garantia);
      } else {
        setError(res.error || "No se pudo guardar la póliza de garantía.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al emitir la garantía.");
    } finally {
      setCargando(false);
    }
  };

  const urlGarantiaPublica = garantiaGuardada?.token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/garantia/${garantiaGuardada.token}`
    : "";

  const mensajeWhatsApp = garantiaGuardada?.token
    ? encodeURIComponent(
        `¡Hola ${clienteNombre}! 🛡️ Le hacemos entrega formal de su *Póliza de Garantía por Servicio* respaldada por Sauceda Construye, correspondiente a la orden de trabajo *${ordenFolio}* (${anosGarantia} año(s) de cobertura).\n\nPuede consultar y descargar su documento oficial aquí:\n${urlGarantiaPublica}\n\n¡Gracias por confiar en Sauceda!`
      )
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-carbon/10">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-xl text-amber-700 border border-amber-500/20">
              🛡️
            </span>
            <div>
              <h3 className="font-titular text-lg font-bold text-verde-profundo">
                Póliza y Carta de Garantía
              </h3>
              <p className="text-xs text-carbon/60 font-cuerpo">
                Orden: <span className="font-mono font-bold text-sauce">{ordenFolio}</span> · Cliente: {clienteNombre}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-carbon/80 mb-1">
                Título del Documento
              </label>
              <input
                type="text"
                required
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Años de Cobertura
              </label>
              <select
                value={anosGarantia}
                onChange={(e) => handleCambiarAnos(Number(e.target.value))}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white font-bold"
              >
                {![0.5, 1, 2, 3, 5, 10].includes(anosGarantia) && (
                  <option value={anosGarantia}>{anosGarantia} Años (según producto)</option>
                )}
                <option value={0.5}>6 Meses</option>
                <option value={1}>1 Año</option>
                <option value={2}>2 Años</option>
                <option value={3}>3 Años (Estándar)</option>
                <option value={5}>5 Años</option>
                <option value={10}>10 Años</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-sauce/25 bg-sauce/5 p-3">
            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Asesor que entrega la instalación
              </label>
              <select
                value={entregadoPorId}
                onChange={(e) => handleCambiarEntregador(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none bg-white"
              >
                <option value="">— Sin asignar —</option>
                {entregadores.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombreCompleto || e.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Nombre completo en la póliza
              </label>
              <input
                type="text"
                value={entregadoPorNombre}
                onChange={(e) => setEntregadoPorNombre(e.target.value)}
                disabled={!entregadoPorId}
                placeholder="Nombre y apellidos"
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none disabled:bg-slate-50"
              />
              <p className="mt-1 text-[10px] text-carbon/50">Se guarda en el perfil del asesor para las próximas pólizas.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Fecha de Inicio de Garantía
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-carbon/80 mb-1">
                Vencimiento Calculado
              </label>
              <div className="rounded-xl border border-carbon/15 bg-carbon/5 px-3 py-2 text-xs text-carbon/70 font-mono font-bold flex items-center gap-1.5">
                <span>📅</span>
                {(() => {
                  const d = new Date(fechaInicio || new Date());
                  d.setMonth(d.getMonth() + Math.round(anosGarantia * 12));
                  return d.toLocaleDateString("es-MX", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  });
                })()}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-semibold text-carbon/80">
                Términos y Cláusulas de Garantía
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={regenerando}
                  onClick={handleRegenerarDesdeProducto}
                  className="text-[10px] text-verde-profundo hover:underline font-bold disabled:opacity-50"
                  title="Vuelve a armar la póliza con la plantilla vigente del producto vendido, la descripción de la cotización y su plazo de garantía"
                >
                  {regenerando ? "Regenerando…" : "🔄 Regenerar desde el producto"}
                </button>
                <button
                  type="button"
                  onClick={() => setContenido(generarTextoPorDefecto(anosGarantia))}
                  className="text-[10px] text-sauce hover:underline font-semibold"
                >
                  ↺ Restaurar plantilla sugerida
                </button>
              </div>
            </div>
            <textarea
              rows={8}
              required
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              className="w-full rounded-xl border border-carbon/20 p-3 text-xs font-mono text-carbon leading-relaxed focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
            />
          </div>

          {garantiaGuardada?.token && (
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="text-[11px] text-amber-900 font-medium">
                Póliza emitida. Enlace público activo para compartir con el cliente.
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={urlGarantiaPublica}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-slate-800 text-white px-3 py-1.5 text-xs font-bold hover:bg-slate-900 transition flex items-center gap-1"
                >
                  🖨️ Ver Documento
                </a>
                {clienteTelefono && (
                  <a
                    href={`https://wa.me/${clienteTelefono.replace(/[^0-9]/g, "")}?text=${mensajeWhatsApp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1"
                  >
                    📲 WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-carbon/10">
            <button
              type="button"
              onClick={alCerrar}
              disabled={cargando}
              className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-carbon/5 transition"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={cargando}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 text-xs font-bold transition shadow-md flex items-center gap-1.5 disabled:opacity-50"
            >
              {cargando ? "Guardando..." : "✓ Guardar y Emitir Póliza"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
