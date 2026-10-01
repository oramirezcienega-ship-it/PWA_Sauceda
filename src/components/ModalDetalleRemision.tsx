"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  type RemisionFacturaEnriquecida,
  type TasaPasarela,
  actualizarCostosRemision,
  ajustarComisionAsesorRemision,
  obtenerParametrosComisionRemision,
} from "@/app/actions/remisiones";

type ModoComision = "automatica" | "porcentaje" | "monto";

const redondear = (n: number) => Math.round(n * 100) / 100;

interface ModalDetalleRemisionProps {
  remision: RemisionFacturaEnriquecida | null;
  abierto: boolean;
  alCerrar: () => void;
  onActualizado?: () => void;
}

export function ModalDetalleRemision({
  remision,
  abierto,
  alCerrar,
  onActualizado,
}: ModalDetalleRemisionProps) {
  const [copiado, setCopiado] = useState(false);
  const [remisionLocal, setRemisionLocal] = useState<RemisionFacturaEnriquecida | null>(remision);
  const [editandoCostos, setEditandoCostos] = useState(false);
  const [costoFinancieroInput, setCostoFinancieroInput] = useState<string>("");
  const [costoProveedorInput, setCostoProveedorInput] = useState<string>("");
  const [guardandoCostos, setGuardandoCostos] = useState(false);
  const [errorCostos, setErrorCostos] = useState("");

  // Parámetros configurados (tasas de pasarela y regla de comisión)
  const [tasasPasarela, setTasasPasarela] = useState<TasaPasarela[]>([]);
  const [porcentajeRegla, setPorcentajeRegla] = useState<number | null>(null);
  const [reglaOrigen, setReglaOrigen] = useState("");
  const [pctPasarelaInput, setPctPasarelaInput] = useState<string>("");
  const [costoProveedorDocs, setCostoProveedorDocs] = useState<{ monto: number; documentos: number }>({
    monto: 0,
    documentos: 0,
  });

  // Ajuste particular de la comisión del asesor
  const [modoComision, setModoComision] = useState<ModoComision>("automatica");
  const [pctComisionInput, setPctComisionInput] = useState<string>("");
  const [montoComisionInput, setMontoComisionInput] = useState<string>("");
  const [motivoAjusteInput, setMotivoAjusteInput] = useState<string>("");

  useEffect(() => {
    setRemisionLocal(remision);
    if (remision) {
      setCostoFinancieroInput(String(remision.costoFinanciero || 0));
      setCostoProveedorInput(String(remision.costoProveedor || 0));
    }
    setEditandoCostos(false);
    setPorcentajeRegla(null);
  }, [remision]);

  useEffect(() => {
    if (!abierto || !remision) return;
    let cancelado = false;
    obtenerParametrosComisionRemision(remision.id).then((res) => {
      if (cancelado) return;
      setTasasPasarela(res.tasasPasarela);
      setPorcentajeRegla(res.porcentajeRegla);
      setReglaOrigen(res.reglaOrigen);
      setCostoProveedorDocs({ monto: res.costoProveedorDocumentos, documentos: res.documentosProveedor });
    });
    return () => {
      cancelado = true;
    };
  }, [abierto, remision]);

  if (!abierto || !remision || !remisionLocal) return null;

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(val);
  };

  const formatearFecha = (fechaStr?: string | null) => {
    if (!fechaStr) return "—";
    try {
      const d = new Date(fechaStr);
      if (isNaN(d.getTime())) return fechaStr;
      return d.toLocaleDateString("es-MX", {
        timeZone: "America/Mexico_City",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return fechaStr;
    }
  };

  const esFactura = remisionLocal.tipo === "factura";

  // % vigente de la comisión: el registrado, o el de la regla si aún no existe
  const porcentajeVigente = remisionLocal.comisionAsesorPorcentaje ?? porcentajeRegla ?? 5;

  const iniciarEdicion = () => {
    setCostoFinancieroInput(String(remisionLocal.costoFinanciero || 0));
    setCostoProveedorInput(String(remisionLocal.costoProveedor || 0));
    setPctPasarelaInput(
      remisionLocal.montoTotal > 0 && remisionLocal.costoFinanciero > 0
        ? String(redondear((remisionLocal.costoFinanciero / remisionLocal.montoTotal) * 100))
        : ""
    );
    const modo: ModoComision = remisionLocal.comisionEsAjusteManual
      ? remisionLocal.comisionAjusteModo || "monto"
      : "automatica";
    setModoComision(modo);
    setPctComisionInput(String(porcentajeVigente));
    setMontoComisionInput(String(remisionLocal.comisionAsesorMonto ?? ""));
    setMotivoAjusteInput(remisionLocal.comisionMotivoAjuste || "");
    setErrorCostos("");
    setEditandoCostos(true);
  };

  const aplicarTasaPasarela = (pct: number) => {
    setPctPasarelaInput(String(pct));
    setCostoFinancieroInput(String(redondear(remisionLocal.montoTotal * (pct / 100))));
  };

  // Previsualización de base gravable y comisión con los valores capturados
  const calcularPrevia = () => {
    const cFin = Math.max(0, parseFloat(costoFinancieroInput) || 0);
    const cProv = Math.max(0, parseFloat(costoProveedorInput) || 0);
    const base = Math.max(0, remisionLocal.montoTotal - cFin - cProv);
    let pct: number;
    let monto: number;
    if (modoComision === "porcentaje") {
      pct = Math.max(0, Math.min(100, parseFloat(pctComisionInput) || 0));
      monto = redondear(base * (pct / 100));
    } else if (modoComision === "monto") {
      monto = Math.max(0, redondear(parseFloat(montoComisionInput) || 0));
      pct = base > 0 ? redondear((monto / base) * 100) : 0;
    } else {
      pct = porcentajeRegla ?? porcentajeVigente;
      monto = redondear(base * (pct / 100));
    }
    return { cFin, cProv, base, pct, monto };
  };

  // URL del portal público para compartir
  const urlPublica = remisionLocal.ordenEntregaToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/orden-trabajo/remision/${remisionLocal.ordenEntregaToken}`
    : remisionLocal.cotizacionToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/cotizacion/remision/${remisionLocal.cotizacionToken}`
    : null;

  const handleCopiarEnlace = async () => {
    if (!urlPublica) return;
    try {
      await navigator.clipboard.writeText(urlPublica);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch (e) {
      console.error("Error al copiar enlace:", e);
    }
  };

  const handleGuardarCostos = async () => {
    if (!remisionLocal) return;
    setErrorCostos("");

    const { cFin, cProv, base, pct, monto } = calcularPrevia();
    const ajustaComision =
      modoComision !== "automatica" || Boolean(remisionLocal.comisionEsAjusteManual);

    if (modoComision !== "automatica" && !motivoAjusteInput.trim()) {
      setErrorCostos("Indique el motivo del ajuste de comisión para esta remisión.");
      return;
    }

    setGuardandoCostos(true);
    try {
      // 1. Deducciones (pasarela y proveedor); el cobro no se modifica
      const res = await actualizarCostosRemision({
        remisionId: remisionLocal.id,
        costoFinanciero: cFin,
        costoProveedor: cProv,
      });

      if (!res.success) {
        setErrorCostos(res.error || "Error al actualizar costos");
        return;
      }

      // 2. Comisión particular del asesor para esta remisión
      if (ajustaComision) {
        const resCom = await ajustarComisionAsesorRemision({
          remisionId: remisionLocal.id,
          modo: modoComision,
          porcentaje: pct,
          monto,
          motivo: motivoAjusteInput,
        });
        if (!resCom.ok) {
          setErrorCostos(resCom.error || "Error al ajustar la comisión");
          return;
        }
      }

      setRemisionLocal((prev) =>
        prev
          ? {
              ...prev,
              costoFinanciero: cFin,
              costoProveedor: cProv,
              tienePasarela: prev.tienePasarela || cFin > 0,
              baseGravableComision: base,
              comisionAsesorPorcentaje: pct,
              comisionAsesorMonto: monto,
              comisionEsAjusteManual: modoComision !== "automatica",
              comisionAjusteModo: modoComision === "automatica" ? null : modoComision,
              comisionMotivoAjuste: modoComision === "automatica" ? undefined : motivoAjusteInput.trim(),
            }
          : prev
      );
      setEditandoCostos(false);
      if (onActualizado) {
        onActualizado();
      }
    } catch (err: any) {
      setErrorCostos(err.message || "Error al guardar costos");
    } finally {
      setGuardandoCostos(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-carbon/10 overflow-hidden my-6">
        {/* Cabecera del Documento */}
        <div className="bg-gradient-to-r from-verde-profundo to-emerald-950 p-6 text-white flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xl">{esFactura ? "🏛️" : "📦"}</span>
              <span
                className={`text-[11px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  esFactura
                    ? "bg-purple-500/20 text-purple-300 border border-purple-400/30"
                    : "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30"
                }`}
              >
                {esFactura ? "Factura Fiscal" : "Remisión de Entrega"}
              </span>
            </div>
            <h2 className="font-titular text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>{remisionLocal.folio}</span>
            </h2>
            <p className="text-xs text-crema/80 font-cuerpo mt-1">
              Emitida el {formatearFecha(remisionLocal.fecha)}
            </p>
          </div>

          <button
            type="button"
            onClick={alCerrar}
            className="rounded-xl bg-white/10 hover:bg-white/20 p-2 text-white/80 hover:text-white transition"
            title="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-carbon font-cuerpo text-xs">
          {/* Tarjeta de Datos del Cliente */}
          <div className="rounded-xl border border-carbon/10 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-carbon/10 pb-2">
              <h4 className="font-titular font-bold text-verde-profundo text-sm uppercase tracking-wide">
                Datos del Cliente
              </h4>
              {remisionLocal.prospectoId && (
                <Link
                  href={`/prospectos/${remisionLocal.prospectoId}`}
                  prefetch={false}
                  className="text-[11px] font-semibold text-sauce hover:underline"
                >
                  Ver Ficha CRM →
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-[10px] uppercase font-bold text-carbon/50">
                  {esFactura ? "Razón Social / Receptor" : "Nombre del Cliente"}
                </span>
                <span className="font-semibold text-carbon text-sm">
                  {remisionLocal.clienteNombre}
                </span>
              </div>

              {esFactura ? (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    RFC Receptor
                  </span>
                  <span className="font-mono font-bold text-carbon">
                    {remisionLocal.datosDocumento?.rfc || "XAXX010101000"}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Persona que Recibe
                  </span>
                  <span className="font-medium text-carbon">
                    {remisionLocal.datosDocumento?.personaRecibe || remisionLocal.clienteNombre}
                  </span>
                </div>
              )}

              {remisionLocal.clienteTelefono && (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Teléfono
                  </span>
                  <span className="font-mono text-carbon">
                    📱 {remisionLocal.clienteTelefono}
                  </span>
                </div>
              )}

              {remisionLocal.clienteEmail && (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Correo Electrónico
                  </span>
                  <span className="text-carbon">
                    ✉️ {remisionLocal.clienteEmail}
                  </span>
                </div>
              )}

              {esFactura && (
                <>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-carbon/50">
                      Régimen Fiscal
                    </span>
                    <span className="text-carbon font-mono">
                      {remisionLocal.datosDocumento?.regimenFiscal || "601"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-carbon/50">
                      Uso de CFDI
                    </span>
                    <span className="text-carbon font-mono">
                      {remisionLocal.datosDocumento?.usoCfdi || "G03 - Gastos en general"}
                    </span>
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <span className="block text-[10px] uppercase font-bold text-carbon/50">
                  Dirección de Entrega / Domicilio
                </span>
                <span className="text-carbon">
                  📍 {remisionLocal.clienteDireccion || "Domicilio en obra"}
                </span>
              </div>
            </div>
          </div>

          {/* Vínculo con Orden de Trabajo y Cotización */}
          <div className="rounded-xl border border-carbon/10 bg-white p-4 space-y-3">
            <h4 className="font-titular font-bold text-verde-profundo text-sm uppercase tracking-wide border-b border-carbon/10 pb-2">
              Origen Operativo
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {remisionLocal.ordenTrabajoId ? (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Orden de Trabajo
                  </span>
                  <Link
                    href={`/ordenes-trabajo/${remisionLocal.ordenTrabajoId}`}
                    prefetch={false}
                    className="font-mono font-bold text-sauce hover:underline text-xs inline-flex items-center gap-1 mt-0.5"
                  >
                    <span>🛠️ {remisionLocal.ordenFolio || "Ver Orden"}</span>
                    <span>→</span>
                  </Link>
                  {remisionLocal.ordenTitulo && (
                    <div className="text-[11px] text-carbon/70 truncate mt-0.5">
                      {remisionLocal.ordenTitulo}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Orden de Trabajo
                  </span>
                  <span className="text-carbon/40 italic">No vinculada a OT</span>
                </div>
              )}

              {remisionLocal.cotizacionId ? (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Cotización Aceptada
                  </span>
                  <Link
                    href={`/cotizacion/${remisionLocal.cotizacionToken || remisionLocal.cotizacionId}`}
                    target="_blank"
                    className="font-mono font-bold text-carbon hover:text-sauce hover:underline text-xs inline-flex items-center gap-1 mt-0.5"
                  >
                    <span>📑 {remisionLocal.cotizacionFolio || remisionLocal.cotizacionId}</span>
                    <span>↗</span>
                  </Link>
                </div>
              ) : (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Cotización
                  </span>
                  <span className="text-carbon/40 italic">Directa sin cotización previa</span>
                </div>
              )}

              <div>
                <span className="block text-[10px] uppercase font-bold text-carbon/50">
                  Asesor Responsable
                </span>
                <span className="font-medium text-carbon mt-0.5 block">
                  👤 {remisionLocal.asesorNombre || "Sin asignar"}
                </span>
              </div>

              {remisionLocal.expedienteId && (
                <div>
                  <span className="block text-[10px] uppercase font-bold text-carbon/50">
                    Expediente
                  </span>
                  <Link
                    href={`/expediente/${remisionLocal.expedienteId}`}
                    prefetch={false}
                    className="text-sauce font-semibold hover:underline mt-0.5 inline-block"
                  >
                    📁 Ver Expediente Completo
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Desglose Financiero & Base Gravable de Comisiones */}
          <div className="rounded-xl border border-carbon/10 bg-slate-50/70 p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between border-b border-carbon/10 pb-2 gap-2">
              <div>
                <h4 className="font-titular font-bold text-verde-profundo text-sm uppercase tracking-wide flex items-center gap-1.5">
                  <span>📊 Desglose Financiero & Base Comisionable</span>
                </h4>
                <p className="text-[11px] text-carbon/60 mt-0.5">
                  Los costos de pasarela y ejecución del proveedor afectan directamente la base gravable de comisión.
                </p>
              </div>

              {!editandoCostos && (
                <button
                  type="button"
                  onClick={iniciarEdicion}
                  className="rounded-lg border border-carbon/20 bg-white hover:bg-slate-100 text-carbon font-semibold px-2.5 py-1 text-[11px] transition shadow-2xs flex items-center gap-1 cursor-pointer"
                  title="Ajustar deducciones y comisión del asesor de esta remisión"
                >
                  <span>⚙️ Ajustar Deducciones y Comisión</span>
                </button>
              )}
            </div>

            {/* Formulario de Edición Rápida de Costos */}
            {editandoCostos ? (
              <div className="rounded-xl border border-dorado/40 bg-dorado/5 p-4 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-verde-profundo flex items-center gap-1.5">
                    <span>⚙️ Configurar Deducciones de la Remisión</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditandoCostos(false)}
                    className="text-carbon/50 hover:text-carbon text-xs"
                  >
                    ✕ Cancelar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                      💳 Costo Financiero (Pasarela / Terminal)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-carbon/40 font-mono">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={costoFinancieroInput}
                        onChange={(e) => {
                          setCostoFinancieroInput(e.target.value);
                          setPctPasarelaInput("");
                        }}
                        className="w-full rounded-lg border border-carbon/20 bg-white pl-6 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:border-sauce"
                        placeholder="0.00"
                      />
                    </div>
                    {/* Sugerencias de pasarela (parametrizadas en Comisiones → Parametrización) */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-carbon/50">Sugerir:</span>
                      {tasasPasarela.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => aplicarTasaPasarela(t.porcentaje)}
                          className="text-[10px] bg-white border border-carbon/20 rounded px-1.5 py-0.5 text-carbon hover:bg-slate-50 cursor-pointer"
                          title={t.notas || `${t.porcentaje}% sobre el total`}
                        >
                          {t.etiqueta} {t.porcentaje}%
                        </button>
                      ))}
                      <div className="relative w-16">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={pctPasarelaInput}
                          onChange={(e) => {
                            setPctPasarelaInput(e.target.value);
                            const pct = parseFloat(e.target.value);
                            if (!isNaN(pct) && pct >= 0) {
                              setCostoFinancieroInput(String(redondear(remisionLocal.montoTotal * (pct / 100))));
                            }
                          }}
                          className="w-full rounded border border-carbon/20 bg-white pl-1.5 pr-4 py-0.5 text-[10px] font-mono focus:outline-none focus:border-sauce"
                          placeholder="Otro"
                          title="Tasa libre (%) sobre el total"
                        />
                        <span className="absolute right-1 top-0.5 text-[10px] text-carbon/40">%</span>
                      </div>
                      <Link
                        href="/comisiones"
                        prefetch={false}
                        className="text-[10px] text-sauce hover:underline"
                        title="Configurar tasas en Comisiones → Parametrización y Reglas"
                      >
                        Configurar tasas
                      </Link>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-carbon/70 uppercase mb-1">
                      👷 Costo de Ejecución (Proveedor / Cuadrilla)
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-2 text-carbon/40 font-mono">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={costoProveedorInput}
                        onChange={(e) => setCostoProveedorInput(e.target.value)}
                        className="w-full rounded-lg border border-carbon/20 bg-white pl-6 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:border-sauce"
                        placeholder="0.00"
                      />
                    </div>
                    {remisionLocal.proveedorNombre && (
                      <span className="text-[10px] text-carbon/60 block mt-1">
                        Asignado a: <strong className="text-carbon">{remisionLocal.proveedorNombre}</strong>
                      </span>
                    )}
                    {costoProveedorDocs.documentos > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px]">
                        <span className="text-carbon/60">
                          Costo real según {costoProveedorDocs.documentos}{" "}
                          {costoProveedorDocs.documentos === 1 ? "documento" : "documentos"} del proveedor:{" "}
                          <strong className="text-carbon font-mono">{formatMoneda(costoProveedorDocs.monto)}</strong>
                        </span>
                        {Math.abs(costoProveedorDocs.monto - (parseFloat(costoProveedorInput) || 0)) > 0.009 && (
                          <button
                            type="button"
                            onClick={() => setCostoProveedorInput(String(costoProveedorDocs.monto))}
                            className="bg-white border border-carbon/20 rounded px-1.5 py-0.5 text-carbon hover:bg-slate-50 cursor-pointer"
                          >
                            Usar costo real
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Comisión del asesor para esta remisión */}
                <div className="border-t border-dorado/30 pt-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-carbon/70 uppercase">
                      💼 Comisión del Asesor (esta remisión)
                    </span>
                    <div className="flex rounded-lg border border-carbon/20 bg-white overflow-hidden text-[10px] font-semibold">
                      {([
                        ["automatica", "Según regla"],
                        ["porcentaje", "% propio"],
                        ["monto", "Monto fijo"],
                      ] as [ModoComision, string][]).map(([valor, etiqueta]) => (
                        <button
                          key={valor}
                          type="button"
                          onClick={() => setModoComision(valor)}
                          className={`px-2 py-1 transition cursor-pointer ${
                            modoComision === valor
                              ? "bg-verde-profundo text-white"
                              : "text-carbon hover:bg-slate-50"
                          }`}
                        >
                          {etiqueta}
                        </button>
                      ))}
                    </div>
                  </div>

                  {modoComision === "automatica" ? (
                    <p className="text-[10px] text-carbon/60">
                      {porcentajeRegla !== null
                        ? `${reglaOrigen} (${porcentajeRegla}%). Se recalcula sola al cambiar las deducciones.`
                        : "Cargando regla configurada..."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {modoComision === "porcentaje" ? (
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={pctComisionInput}
                            onChange={(e) => setPctComisionInput(e.target.value)}
                            className="w-full rounded-lg border border-carbon/20 bg-white pl-3 pr-6 py-1.5 text-xs font-mono focus:outline-none focus:border-sauce"
                            placeholder="5.00"
                          />
                          <span className="absolute right-2.5 top-2 text-carbon/40 font-mono">%</span>
                        </div>
                      ) : (
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-carbon/40 font-mono">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={montoComisionInput}
                            onChange={(e) => setMontoComisionInput(e.target.value)}
                            className="w-full rounded-lg border border-carbon/20 bg-white pl-6 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:border-sauce"
                            placeholder="0.00"
                          />
                        </div>
                      )}
                      <input
                        type="text"
                        value={motivoAjusteInput}
                        onChange={(e) => setMotivoAjusteInput(e.target.value)}
                        className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs focus:outline-none focus:border-sauce"
                        placeholder="Motivo del ajuste (obligatorio)"
                      />
                    </div>
                  )}

                  {remisionLocal.comisionMontoPagado !== undefined && remisionLocal.comisionMontoPagado > 0 && (
                    <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      Ya se pagaron {formatMoneda(remisionLocal.comisionMontoPagado)} de esta comisión; el saldo pendiente se recalcula con el nuevo monto.
                    </p>
                  )}
                </div>

                {/* Previsualización del recálculo */}
                {(() => {
                  const { base, pct, monto } = calcularPrevia();
                  return (
                    <div className="bg-white/80 border border-carbon/10 rounded-lg p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-carbon/50 block">
                          Nueva Base Gravable Resultante
                        </span>
                        <span className="font-mono font-bold text-verde-profundo text-sm">
                          {formatMoneda(base)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-carbon/50 block">
                          Comisión Asesor ({pct}%)
                        </span>
                        <span className="font-mono font-bold text-sauce">
                          {formatMoneda(monto)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <p className="text-[10px] text-carbon/60">
                  Al guardar, la venta, el costo de proveedor, la terminal y la comisión se actualizan en Finanzas y en la rentabilidad por producto.
                </p>

                {errorCostos && (
                  <p className="text-[11px] text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    {errorCostos}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditandoCostos(false)}
                    className="rounded-lg bg-slate-200 hover:bg-slate-300 text-carbon font-semibold px-3 py-1.5 text-xs transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleGuardarCostos}
                    disabled={guardandoCostos}
                    className="rounded-lg bg-emerald-700 hover:bg-verde-profundo text-white font-bold px-3 py-1.5 text-xs transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {guardandoCostos ? (
                      <>
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <span>💾 Guardar Deducciones y Comisión</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Resumen de Importes y Deducciones */}
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between text-carbon/70">
                <span>Subtotal Base:</span>
                <span>{formatMoneda(remisionLocal.montoSubtotal)}</span>
              </div>

              {remisionLocal.serviciosExtra > 0 && (
                <div className="flex justify-between text-carbon/70">
                  <span>Servicios Extra:</span>
                  <span>+{formatMoneda(remisionLocal.serviciosExtra)}</span>
                </div>
              )}

              <div className="border-t border-carbon/10 pt-1.5 flex justify-between font-bold text-sm text-carbon">
                <span>Total Facturado / Remitido:</span>
                <span className="text-emerald-900">{formatMoneda(remisionLocal.montoTotal)}</span>
              </div>

              {/* Deducciones Operativas */}
              <div className="border-t border-dashed border-carbon/20 pt-2 space-y-1.5 bg-slate-100/50 p-2.5 rounded-lg">
                <div className="flex items-center justify-between text-[11px] font-sans font-bold text-carbon/60 uppercase">
                  <span>Deducciones para Base Comisionable</span>
                  {remisionLocal.tienePasarela && (
                    <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded-full border border-amber-300">
                      💳 Pasarela / Terminal en Cobro
                    </span>
                  )}
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-carbon/80 font-sans flex items-center gap-1">
                    <span>💳 Costo Financiero (Pasarela):</span>
                  </span>
                  <span className={`font-mono font-semibold ${remisionLocal.costoFinanciero > 0 ? "text-red-700" : "text-carbon/40"}`}>
                    {remisionLocal.costoFinanciero > 0 ? `-${formatMoneda(remisionLocal.costoFinanciero)}` : "$0.00"}
                  </span>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-carbon/80 font-sans flex items-center gap-1">
                    <span>👷 Costo de Ejecución (Proveedor):</span>
                    {remisionLocal.proveedorNombre && (
                      <span className="text-[10px] text-carbon/50 font-normal truncate max-w-[160px]" title={remisionLocal.proveedorNombre}>
                        ({remisionLocal.proveedorNombre})
                      </span>
                    )}
                  </span>
                  <span className={`font-mono font-semibold ${remisionLocal.costoProveedor > 0 ? "text-red-700" : "text-carbon/40"}`}>
                    {remisionLocal.costoProveedor > 0 ? `-${formatMoneda(remisionLocal.costoProveedor)}` : "$0.00"}
                  </span>
                </div>

                {remisionLocal.otrosGastos > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-carbon/80 font-sans">Otros Gastos de Venta:</span>
                    <span className="font-mono font-semibold text-red-700">
                      -{formatMoneda(remisionLocal.otrosGastos)}
                    </span>
                  </div>
                )}
              </div>

              {/* Base Gravable Destacada */}
              <div className="rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-300 p-3 space-y-1">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800 block">
                      Base Gravable para Comisión
                    </span>
                    <span className="text-[11px] text-emerald-700/80 font-sans">
                      (Total - Pasarela - Proveedor)
                    </span>
                  </div>
                  <span className="font-mono text-base font-bold text-verde-profundo">
                    {formatMoneda(remisionLocal.baseGravableComision)}
                  </span>
                </div>

                <div className="border-t border-emerald-200/80 pt-1.5 flex justify-between items-center text-xs">
                  <span className="text-emerald-900 font-sans font-medium flex items-center gap-1">
                    <span>💼 Comisión Asesor ({porcentajeVigente}%):</span>
                    {remisionLocal.comisionEsAjusteManual && (
                      <span
                        className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 rounded-full border border-amber-300"
                        title={remisionLocal.comisionMotivoAjuste || "Ajuste manual"}
                      >
                        ✍️ Ajuste manual
                      </span>
                    )}
                  </span>
                  <span className="font-mono font-bold text-emerald-800">
                    {formatMoneda(
                      remisionLocal.comisionAsesorMonto ??
                        redondear(remisionLocal.baseGravableComision * (porcentajeVigente / 100))
                    )}
                  </span>
                </div>
                {remisionLocal.comisionEsAjusteManual && remisionLocal.comisionMotivoAjuste && (
                  <p className="text-[10px] text-emerald-900/70 font-sans">
                    Motivo: {remisionLocal.comisionMotivoAjuste}
                  </p>
                )}
              </div>

              {/* Cobranza */}
              {remisionLocal.ordenTrabajoId && (
                <div className="mt-3 pt-3 border-t border-carbon/10 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-carbon/50">
                      Total Cobrado (Recibos)
                    </span>
                    <span className="font-bold text-emerald-700">
                      {formatMoneda(remisionLocal.totalCobrado)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-carbon/50">
                      Saldo Restante
                    </span>
                    <span
                      className={`font-bold ${
                        remisionLocal.saldoRestante > 0 ? "text-amber-700" : "text-emerald-700"
                      }`}
                    >
                      {remisionLocal.saldoRestante > 0
                        ? formatMoneda(remisionLocal.saldoRestante)
                        : "✓ Liquidado"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Barra de Acciones Inferior */}
        <div className="bg-slate-50 border-t border-carbon/10 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {urlPublica && (
              <button
                type="button"
                onClick={handleCopiarEnlace}
                className="rounded-xl border border-carbon/20 bg-white hover:bg-slate-100 text-carbon font-semibold px-3 py-2 text-xs transition shadow-2xs flex items-center gap-1.5"
                title="Copiar link para enviar por WhatsApp"
              >
                <span>{copiado ? "✓ Copiado" : "📋 Copiar Enlace"}</span>
              </button>
            )}

            {urlPublica && (
              <a
                href={urlPublica}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-sauce hover:bg-verde-profundo text-white font-bold px-3 py-2 text-xs transition shadow-2xs flex items-center gap-1.5"
              >
                <span>🖨️ Ver Documento / Imprimir</span>
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={alCerrar}
            className="rounded-xl bg-slate-200 hover:bg-slate-300 text-carbon font-bold px-4 py-2 text-xs transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
