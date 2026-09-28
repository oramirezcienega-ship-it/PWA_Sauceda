"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  obtenerDatosProgramacionInstalacion,
  programarInstalacionYDetonarOT,
} from "@/app/actions/ordenes-trabajo";

interface ModalProgramarInstalacionCotizacionProps {
  cotizacionId: string;
  abierto: boolean;
  alCerrar: () => void;
  alExito?: (res: { ordenId: string; ordenFolio: string }) => void;
}

export function ModalProgramarInstalacionCotizacion({
  cotizacionId,
  abierto,
  alCerrar,
  alExito,
}: ModalProgramarInstalacionCotizacionProps) {
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Datos precargados
  const [datosIniciales, setDatosIniciales] = useState<any>(null);

  // Campos del Formulario
  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("09:00");
  const [horaFin, setHoraFin] = useState("14:00");
  const [asesorId, setAsesorId] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [costoProveedor, setCostoProveedor] = useState("");
  const [metodoPago, setMetodoPago] = useState("terminal_tarjeta");
  const [montoSaldo, setMontoSaldo] = useState<number>(0);
  const [notas, setNotas] = useState("");
  const [notificarCliente, setNotificarCliente] = useState(true);
  const [notificarProveedor, setNotificarProveedor] = useState(true);
  const [notificarAsesor, setNotificarAsesor] = useState(true);

  // Resultado Exitoso
  const [resultado, setResultado] = useState<any | null>(null);

  useEffect(() => {
    if (!abierto || !cotizacionId) return;

    let cancelado = false;
    setCargandoDatos(true);
    setError("");
    setResultado(null);

    obtenerDatosProgramacionInstalacion(cotizacionId)
      .then((res) => {
        if (cancelado) return;
        if (res.ok && res.cotizacion) {
          setDatosIniciales(res);

          // Sugerir fecha: si ya tiene cita o fecha en OT usarla, sino mañana
          if (res.ordenExistente?.fecha_programada) {
            setFecha(res.ordenExistente.fecha_programada);
          } else if (res.citaExistente?.fecha) {
            setFecha(res.citaExistente.fecha);
          } else {
            const manana = new Date();
            manana.setDate(manana.getDate() + 1);
            setFecha(manana.toISOString().split("T")[0]);
          }

          if (res.citaExistente?.hora_inicio) {
            setHoraInicio(res.citaExistente.hora_inicio.slice(0, 5));
          }
          if (res.citaExistente?.hora_fin) {
            setHoraFin(res.citaExistente.hora_fin.slice(0, 5));
          }

          setAsesorId(
            res.ordenExistente?.asesor_ejecutor_id ||
              res.citaExistente?.perfil_id ||
              res.asesores[0]?.id ||
              ""
          );
          setProveedorId(res.ordenExistente?.proveedor_id || "");
          setCostoProveedor(
            res.ordenExistente?.costo_proveedor
              ? String(res.ordenExistente.costo_proveedor)
              : ""
          );
          setMontoSaldo(res.saldoRestante ?? res.montoTotal ?? 0);
        } else {
          setError(res.error || "No se pudieron obtener los datos de la cotización.");
        }
      })
      .catch((err) => {
        if (!cancelado) setError(err?.message || "Error al cargar datos.");
      })
      .finally(() => {
        if (!cancelado) setCargandoDatos(false);
      });

    return () => {
      cancelado = true;
    };
  }, [abierto, cotizacionId]);

  if (!abierto) return null;

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fecha) {
      setError("Debes indicar una fecha válida para la instalación.");
      return;
    }

    try {
      setGuardando(true);
      setError("");

      const res = await programarInstalacionYDetonarOT({
        cotizacionId,
        fechaInstalacion: fecha,
        horaInicio,
        horaFin,
        asesorEjecutorId: asesorId || null,
        proveedorId: proveedorId || null,
        costoProveedor: costoProveedor ? Number(costoProveedor) : null,
        proveedorConcepto: proveedorId ? `Instalación de ${datosIniciales?.servicioTipo}` : null,
        metodoPagoSaldo: metodoPago,
        montoSaldo,
        notasInstalacion: notas,
        notificarClienteWhatsApp: notificarCliente,
        notificarProveedorWhatsApp: notificarProveedor,
        notificarAsesorApp: notificarAsesor,
      });

      if (res.ok) {
        setResultado(res);
        if (alExito && res.ordenId && res.ordenFolio) {
          alExito({ ordenId: res.ordenId, ordenFolio: res.ordenFolio });
        }
      } else {
        setError(res.error || "Ocurrió un error al programar la instalación.");
      }
    } catch (err: any) {
      setError(err?.message || "Error al procesar la solicitud.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-carbon/10 overflow-hidden my-6">
        {/* Cabecera Modal */}
        <div className="bg-gradient-to-r from-verde-profundo to-emerald-950 p-6 text-white flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xl">🛠️</span>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-dorado/20 text-dorado border border-dorado/30">
                Flujo Operativo & Técnico
              </span>
            </div>
            <h2 className="font-titular text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Programar Instalación & Detonar OT</span>
            </h2>
            <p className="text-xs text-crema/80 font-cuerpo mt-1">
              Cotización <span className="font-mono font-bold text-dorado">{cotizacionId}</span> · {datosIniciales?.clienteNombre || "Cliente"}
            </p>
          </div>

          <button
            type="button"
            onClick={alCerrar}
            className="rounded-xl bg-white/10 hover:bg-white/20 p-2 text-white/80 hover:text-white transition cursor-pointer"
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {cargandoDatos ? (
          <div className="p-12 text-center space-y-3">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-sauce border-t-transparent"></div>
            <p className="text-xs font-semibold text-carbon/60">
              Cargando información técnica y operativa de la cotización...
            </p>
          </div>
        ) : resultado ? (
          /* Vista de Éxito */
          <div className="p-6 space-y-5 text-carbon font-cuerpo">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-300 p-5 text-center space-y-2">
              <span className="text-4xl block">🎉</span>
              <h3 className="font-titular text-xl font-bold text-emerald-950">
                ¡Instalación Programada y OT Detonada!
              </h3>
              <p className="text-xs text-emerald-800 max-w-md mx-auto">
                La orden de trabajo <span className="font-mono font-bold">{resultado.ordenFolio}</span> ha quedado creada en estado operativo y vinculada a la agenda.
              </p>
            </div>

            {/* Accesos directos a WhatsApp */}
            <div className="space-y-3">
              <h4 className="font-titular font-bold text-xs uppercase tracking-wider text-carbon/60">
                Confirmaciones & Notificaciones Generadas
              </h4>

              {resultado.urlWhatsAppCliente && (
                <div className="rounded-xl border border-carbon/10 bg-slate-50 p-3.5 flex items-center justify-between gap-3">
                  <div className="text-xs">
                    <span className="font-bold text-carbon block">
                      📲 Mensaje para el Cliente ({datosIniciales?.clienteNombre})
                    </span>
                    <span className="text-[11px] text-carbon/60">
                      Incluye fecha, horario, dirección y saldo a cobrar con terminal.
                    </span>
                  </div>
                  <a
                    href={resultado.urlWhatsAppCliente}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#128C7E] transition shadow-xs whitespace-nowrap"
                  >
                    <span>💬 WhatsApp Cliente</span>
                  </a>
                </div>
              )}

              {resultado.urlWhatsAppProveedor && (
                <div className="rounded-xl border border-carbon/10 bg-slate-50 p-3.5 flex items-center justify-between gap-3">
                  <div className="text-xs">
                    <span className="font-bold text-carbon block">
                      👷 Mensaje para Proveedor / Cuadrilla Asignada
                    </span>
                    <span className="text-[11px] text-carbon/60">
                      Instrucciones de obra, concepto y recordatorio de llevar terminal bancaria.
                    </span>
                  </div>
                  <a
                    href={resultado.urlWhatsAppProveedor}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-verde-profundo text-white px-3 py-1.5 text-xs font-bold hover:bg-emerald-900 transition shadow-xs whitespace-nowrap"
                  >
                    <span>🛠️ WhatsApp Proveedor</span>
                  </a>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-carbon/10 flex items-center justify-between gap-3">
              <Link
                href={`/ordenes-trabajo/${resultado.ordenId}`}
                className="rounded-xl bg-sauce hover:bg-verde-profundo text-white font-bold px-4 py-2.5 text-xs transition shadow-sm flex items-center gap-2"
              >
                <span>🛠️ Ver Orden de Trabajo ({resultado.ordenFolio})</span>
                <span>→</span>
              </Link>

              <button
                type="button"
                onClick={alCerrar}
                className="rounded-xl bg-slate-200 hover:bg-slate-300 text-carbon font-bold px-4 py-2.5 text-xs transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          /* Formulario de Programación */
          <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs font-cuerpo text-carbon">
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rojo/20 p-3 text-rojo text-xs font-semibold">
                ⚠️ {error}
              </div>
            )}

            {/* Resumen del Trabajo */}
            <div className="rounded-xl border border-carbon/10 bg-slate-50/70 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-verde-profundo uppercase text-[10px] tracking-wider">
                  Trabajo a Ejecutar
                </span>
                <span className="font-mono font-bold text-carbon text-sm">
                  {formatMoneda(datosIniciales?.montoTotal || 0)}
                </span>
              </div>
              <p className="text-xs text-carbon/80 font-semibold">
                {datosIniciales?.servicioTipo}
              </p>
              {datosIniciales?.conceptos && datosIniciales.conceptos.length > 0 && (
                <div className="pt-1 text-[11px] text-carbon/60 space-y-0.5">
                  {datosIniciales.conceptos.slice(0, 3).map((c: any, i: number) => (
                    <div key={i} className="truncate">
                      • {c.cantidad} {c.unidad} - {c.descripcion}
                    </div>
                  ))}
                  {datosIniciales.conceptos.length > 3 && (
                    <div className="italic text-carbon/40">
                      +{datosIniciales.conceptos.length - 3} concepto(s) más
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fecha y Horario de Instalación */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-[10px] uppercase font-bold text-carbon/60 mb-1">
                  Fecha de Instalación *
                </label>
                <input
                  type="date"
                  required
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-carbon/60 mb-1">
                  Hora de Llegada
                </label>
                <input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-carbon/60 mb-1">
                  Hora Estimada Fin
                </label>
                <input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
                />
              </div>
            </div>

            {/* Asesor y Proveedor / Cuadrilla */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-carbon/60 mb-1">
                  Asesor / Supervisor de Obra
                </label>
                <select
                  value={asesorId}
                  onChange={(e) => setAsesorId(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
                >
                  <option value="">Seleccionar Asesor...</option>
                  {datosIniciales?.asesores?.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      👤 {a.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-carbon/60 mb-1">
                  Proveedor / Cuadrilla de Instalación
                </label>
                <select
                  value={proveedorId}
                  onChange={(e) => setProveedorId(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
                >
                  <option value="">Sin proveedor asignado (Personal propio)</option>
                  {datosIniciales?.proveedores?.map((pr: any) => (
                    <option key={pr.id} value={pr.id}>
                      🧾 {pr.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Si hay proveedor, costo de mano de obra / subcontrato */}
            {proveedorId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-purple-50/50 rounded-xl border border-purple-200/60">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-purple-900 mb-1">
                    Costo Acordado con Proveedor ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej. 3500.00"
                    value={costoProveedor}
                    onChange={(e) => setCostoProveedor(e.target.value)}
                    className="w-full rounded-xl border border-purple-300 px-3 py-2 text-xs text-carbon outline-none focus:border-purple-600 bg-white"
                  />
                </div>
                <div className="text-[10px] text-purple-700 flex items-center">
                  💡 Se generará automáticamente el registro en la cuenta del proveedor vinculado a la Orden de Trabajo.
                </div>
              </div>
            )}

            {/* Condición de Pago y Terminal Bancaria */}
            <div className="rounded-xl border border-carbon/10 p-3.5 space-y-3 bg-amber-50/40">
              <div className="flex items-center gap-2">
                <span className="text-base">💳</span>
                <span className="font-bold text-amber-950 uppercase text-[10.5px] tracking-wider">
                  Condición de Cobro y Prevención de Terminal
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-carbon/60 mb-1">
                    Forma de Cobro del Saldo
                  </label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white font-medium"
                  >
                    <option value="terminal_tarjeta">
                      💳 Terminal Bancaria en Sitio (Llevar Clip / Terminal)
                    </option>
                    <option value="transferencia">🏦 Transferencia Bancaria previa</option>
                    <option value="efectivo">💵 Efectivo contra entrega</option>
                    <option value="liquidado">✓ Previamente liquidado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-carbon/60 mb-1">
                    Monto de Saldo a Liquidar ($ MXN)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={montoSaldo}
                    onChange={(e) => setMontoSaldo(Number(e.target.value))}
                    className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs font-mono font-bold text-verde-profundo outline-none focus:border-sauce bg-white"
                  />
                </div>
              </div>

              {metodoPago === "terminal_tarjeta" && (
                <div className="text-[11px] text-amber-800 font-medium flex items-center gap-1.5 bg-amber-100/60 p-2 rounded-lg border border-amber-300/50">
                  <span>⚠️</span>
                  <span>
                    El mensaje al proveedor y la orden de trabajo advertirán explícitamente llevar terminal bancaria con batería y señal para cobrar al cliente al concluir.
                  </span>
                </div>
              )}
            </div>

            {/* Notas e Indicaciones */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-carbon/60 mb-1">
                Instrucciones Técnicas / Notas para la Cuadrilla
              </label>
              <textarea
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej. Llevar escalera de 6m, acceso por patio posterior, retirar impermeabilizante viejo..."
                className="w-full rounded-xl border border-carbon/20 px-3 py-2 text-xs text-carbon outline-none focus:border-sauce bg-white"
              />
            </div>

            {/* Casillas de Notificación Automática */}
            <div className="space-y-2 pt-1 border-t border-carbon/10">
              <span className="block text-[10px] uppercase font-bold text-carbon/50">
                Notificaciones Inmediatas
              </span>

              <div className="flex flex-col sm:flex-row gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={notificarCliente}
                    onChange={(e) => setNotificarCliente(e.target.checked)}
                    className="rounded text-sauce focus:ring-sauce"
                  />
                  <span>📲 Enviar confirmación al Cliente</span>
                </label>

                {proveedorId && (
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={notificarProveedor}
                      onChange={(e) => setNotificarProveedor(e.target.checked)}
                      className="rounded text-sauce focus:ring-sauce"
                    />
                    <span>👷 Enviar asignación al Proveedor</span>
                  </label>
                )}

                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={notificarAsesor}
                    onChange={(e) => setNotificarAsesor(e.target.checked)}
                    className="rounded text-sauce focus:ring-sauce"
                  />
                  <span>👤 Notificar al Asesor en CRM</span>
                </label>
              </div>
            </div>

            {/* Barra de Acciones */}
            <div className="pt-4 border-t border-carbon/10 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={alCerrar}
                disabled={guardando}
                className="rounded-xl bg-slate-200 hover:bg-slate-300 text-carbon font-bold px-4 py-2.5 text-xs transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={guardando}
                className="rounded-xl bg-sauce hover:bg-verde-profundo text-white font-bold px-5 py-2.5 text-xs transition shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {guardando ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    <span>Programando & Detonando OT...</span>
                  </>
                ) : (
                  <>
                    <span>📅</span>
                    <span>Confirmar Programación & Generar OT</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
