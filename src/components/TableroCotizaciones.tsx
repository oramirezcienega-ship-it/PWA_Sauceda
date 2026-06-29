"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { crearCotizacion } from "@/app/actions/cotizaciones";
import type { Cotizacion, ServicioConstruccionTipo, CotizacionEstatus } from "@/lib/types";

interface TableroCotizacionesProps {
  cotizacionesIniciales: Cotizacion[];
  prospectos: { id: string; nombre: string }[];
  inspectores: { id: string; nombre: string }[];
}

export function TableroCotizaciones({
  cotizacionesIniciales,
  prospectos,
  inspectores,
}: TableroCotizacionesProps) {
  const router = useRouter();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>(cotizacionesIniciales);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState<string>("todos");
  const [filtroServicio, setFiltroServicio] = useState<string>("todos");

  // Form State
  const [prospectoId, setProspectoId] = useState("");
  const [servicioTipo, setServicioTipo] = useState<ServicioConstruccionTipo>("pintura");
  const [requiereVisita, setRequiereVisita] = useState(true);
  const [fechaVisita, setFechaVisita] = useState("");
  const [inspectorId, setInspectorId] = useState("");
  const [notasInternas, setNotasInternas] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prospectoId) {
      setErrorForm("Por favor, selecciona un prospecto.");
      return;
    }
    if (requiereVisita && (!fechaVisita || !inspectorId)) {
      setErrorForm("Por favor, especifica la fecha de visita y asigna un inspector.");
      return;
    }

    try {
      setCargando(true);
      setErrorForm("");
      const nueva = await crearCotizacion({
        prospectoId,
        servicioTipo,
        requiereVisita,
        fechaVisita: requiereVisita ? new Date(fechaVisita).toISOString() : null,
        inspectorId: requiereVisita ? inspectorId : null,
        notasInternas,
      });

      setCotizaciones((prev) => [nueva, ...prev]);
      setModalAbierto(false);
      
      // Reset form
      setProspectoId("");
      setServicioTipo("pintura");
      setRequiereVisita(true);
      setFechaVisita("");
      setInspectorId("");
      setNotasInternas("");

      // Redirect to detail page
      router.push(`/construccion/${nueva.id}`);
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : "Error al crear la cotización");
    } finally {
      setCargando(false);
    }
  };

  const cotizacionesFiltradas = cotizaciones.filter((c) => {
    const coincideBusqueda =
      c.id.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.prospectoNombre?.toLowerCase().includes(busqueda.toLowerCase());

    const coincideEstatus = filtroEstatus === "todos" || c.estatus === filtroEstatus;
    const coincideServicio = filtroServicio === "todos" || c.servicioTipo === filtroServicio;

    return coincideBusqueda && coincideEstatus && coincideServicio;
  });

  const getEstatusBadge = (estatus: CotizacionEstatus) => {
    switch (estatus) {
      case "borrador":
        return <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 uppercase">Borrador</span>;
      case "esperando_visita":
        return <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 uppercase">Esperando Visita</span>;
      case "en_inspeccion":
        return <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 uppercase">En Inspección</span>;
      case "calculando_costo":
        return <span className="inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 uppercase">En Costeo</span>;
      case "pendiente_aprobacion":
        return <span className="inline-block rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700 uppercase">Pendiente Aprobación</span>;
      case "aprobada":
        return <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 uppercase">Aprobada</span>;
      case "enviada":
        return <span className="inline-block rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700 uppercase">Enviada a Cliente</span>;
      case "aceptada":
        return <span className="inline-block rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase">Aceptada ✓</span>;
      case "rechazada":
        return <span className="inline-block rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700 uppercase">Rechazada</span>;
      case "archivada":
        return <span className="inline-block rounded-full bg-slate-300 px-2.5 py-0.5 text-xs font-semibold text-slate-600 uppercase">Archivada</span>;
    }
  };

  const getServicioLabel = (tipo: ServicioConstruccionTipo) => {
    switch (tipo) {
      case "pintura": return "Pintura";
      case "impermeabilizacion": return "Impermeabilización";
      case "losa": return "Construcción de Losa";
      case "remodelacion": return "Remodelación";
      case "otro": return "Otro Servicio";
    }
  };

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-carbon/10 shadow-sm">
        <div className="flex flex-1 min-w-[280px] max-w-md relative">
          <input
            type="text"
            placeholder="Buscar por folio o cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-carbon/20 focus:border-sauce focus:outline-none focus:ring-1 focus:ring-sauce"
          />
          <svg className="w-5 height-5 absolute left-3 top-2.5 text-carbon/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro Servicio */}
          <select
            value={filtroServicio}
            onChange={(e) => setFiltroServicio(e.target.value)}
            className="rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
          >
            <option value="todos">Todos los servicios</option>
            <option value="pintura">Pintura</option>
            <option value="impermeabilizacion">Impermeabilización</option>
            <option value="losa">Construcción de Losa</option>
            <option value="remodelacion">Remodelación</option>
            <option value="otro">Otro</option>
          </select>

          {/* Filtro Estatus */}
          <select
            value={filtroEstatus}
            onChange={(e) => setFiltroEstatus(e.target.value)}
            className="rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
          >
            <option value="todos">Todos los estatus</option>
            <option value="borrador">Borrador</option>
            <option value="esperando_visita">Esperando Visita</option>
            <option value="calculando_costo">En Costeo</option>
            <option value="pendiente_aprobacion">Pendiente Aprobación</option>
            <option value="aprobada">Aprobada</option>
            <option value="enviada">Enviada a Cliente</option>
            <option value="aceptada">Aceptada</option>
            <option value="rechazada">Rechazada</option>
          </select>

          <button
            onClick={() => setModalAbierto(true)}
            className="rounded-lg bg-sauce px-4 py-2 text-sm font-semibold text-white transition hover:bg-verde-profundo shadow-sm"
          >
            + Nueva Cotización
          </button>
        </div>
      </div>

      {/* Listado / Tabla */}
      <div className="bg-white rounded-xl border border-carbon/10 shadow-sm overflow-hidden">
        {cotizacionesFiltradas.length === 0 ? (
          <div className="p-12 text-center text-carbon/40">
            No se encontraron cotizaciones con los filtros actuales.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 border-b border-carbon/10 font-titular font-semibold text-carbon/60 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Folio</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Servicio</th>
                  <th className="px-6 py-4">Estatus</th>
                  <th className="px-6 py-4 text-right">Precio Venta</th>
                  <th className="px-6 py-4 text-center">Firma Com.</th>
                  <th className="px-6 py-4 text-center">Firma Op.</th>
                  <th className="px-6 py-4">Asignado</th>
                  <th className="px-6 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-carbon/5 font-cuerpo text-carbon">
                {cotizacionesFiltradas.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-mono font-bold text-sauce">{c.id}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold">{c.prospectoNombre}</div>
                      <div className="text-xs text-carbon/40 font-mono">{c.prospectoTelefono}</div>
                    </td>
                    <td className="px-6 py-4">{getServicioLabel(c.servicioTipo)}</td>
                    <td className="px-6 py-4">{getEstatusBadge(c.estatus)}</td>
                    <td className="px-6 py-4 text-right font-mono font-semibold text-verde-profundo">
                      {c.precioFinal > 0 ? formatMoneda(c.precioFinal) : "—"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          c.aprobadoComercial ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-600"
                        }`}
                        title={c.aprobadoComercial ? `Firmado por ${c.aprobadoComercialByNombre}` : "Pendiente"}
                      >
                        {c.aprobadoComercial ? "✓" : "⚡"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          c.aprobadoOperativo ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-600"
                        }`}
                        title={c.aprobadoOperativo ? `Firmado por ${c.aprobadoOperativoByNombre}` : "Pendiente"}
                      >
                        {c.aprobadoOperativo ? "✓" : "⚡"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-carbon/60 text-xs">
                      {c.requiereVisita ? (c.inspectorNombre || "No asignado") : "No requiere visita"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/construccion/${c.id}`}
                        className="rounded-md border border-sauce/20 bg-sauce/5 px-3 py-1.5 text-xs font-semibold text-sauce hover:bg-sauce hover:text-white transition"
                      >
                        Ver Detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Nueva Cotización */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border border-carbon/10 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-verde-profundo px-6 py-4 text-white flex justify-between items-center">
              <h3 className="font-titular text-lg font-semibold text-crema">Registrar Solicitud / Cotización</h3>
              <button onClick={() => setModalAbierto(false)} className="text-crema/80 hover:text-crema text-xl">✕</button>
            </div>
            <form onSubmit={handleCrear} className="p-6 space-y-4 font-cuerpo">
              {errorForm && (
                <div className="p-3 text-xs bg-rose-50 border border-rojo/30 rounded-lg text-rojo">
                  {errorForm}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Prospecto / Cliente</label>
                <select
                  value={prospectoId}
                  onChange={(e) => setProspectoId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                >
                  <option value="">-- Selecciona un prospecto --</option>
                  {prospectos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Tipo de Servicio</label>
                <select
                  value={servicioTipo}
                  onChange={(e) => setServicioTipo(e.target.value as ServicioConstruccionTipo)}
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                >
                  <option value="pintura">Pintura</option>
                  <option value="impermeabilizacion">Impermeabilización</option>
                  <option value="losa">Construcción de Losa (Techo)</option>
                  <option value="remodelacion">Remodelación</option>
                  <option value="otro">Otro Servicio</option>
                </select>
              </div>

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="requiereVisita"
                  checked={requiereVisita}
                  onChange={(e) => setRequiereVisita(e.target.checked)}
                  className="rounded text-sauce focus:ring-sauce h-4 w-4"
                />
                <label htmlFor="requiereVisita" className="text-sm font-medium text-carbon/80 cursor-pointer">
                  ¿Requiere inspección física en el domicilio?
                </label>
              </div>

              {requiereVisita && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-100 bg-slate-50/50 p-4 rounded-xl">
                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Fecha de la Visita</label>
                    <input
                      type="datetime-local"
                      value={fechaVisita}
                      onChange={(e) => setFechaVisita(e.target.value)}
                      required={requiereVisita}
                      className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Inspector Asignado</label>
                    <select
                      value={inspectorId}
                      onChange={(e) => setInspectorId(e.target.value)}
                      required={requiereVisita}
                      className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                    >
                      <option value="">-- Selecciona --</option>
                      {inspectores.map((i) => (
                        <option key={i.id} value={i.id}>{i.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Notas Internas Iniciales</label>
                <textarea
                  value={notasInternas}
                  onChange={(e) => setNotasInternas(e.target.value)}
                  rows={3}
                  placeholder="Detalles sobre las necesidades del cliente..."
                  className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="rounded-lg border border-carbon/15 bg-white px-4 py-2 text-sm font-semibold text-carbon/70 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="rounded-lg bg-sauce px-5 py-2 text-sm font-semibold text-white transition hover:bg-verde-profundo disabled:opacity-50"
                >
                  {cargando ? "Registrando..." : "Crear Cotización"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
