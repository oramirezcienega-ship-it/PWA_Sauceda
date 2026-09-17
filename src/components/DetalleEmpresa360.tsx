"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatoPesos } from "@/lib/formato";
import { Actividades } from "./Actividades";
import { EtapaBadge } from "./EtapaBadge";
import { EstatusProspectoBadge } from "./EstatusProspectoBadge";
import { CalificacionProspectoBadge } from "./CalificacionProspectoBadge";
import {
  actualizarEmpresa,
  eliminarEmpresa,
  asociarProspectoAEmpresa,
  asociarNegocioAEmpresa,
  listarProspectosDisponibles,
  listarNegociosDisponibles,
} from "@/app/actions/empresas";
import { type Empresa, type Prospecto, type Expediente, type DatosEmpresa, INDUSTRIAS_COMUNES } from "@/lib/types";

interface DetalleEmpresa360Props {
  empresaInicial: Empresa;
  prospectosIniciales: Prospecto[];
  negociosIniciales: Expediente[];
  asesores: { id: string; nombre: string }[];
}

export function DetalleEmpresa360({
  empresaInicial,
  prospectosIniciales,
  negociosIniciales,
  asesores,
}: DetalleEmpresa360Props) {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa>(empresaInicial);
  const [prospectos, setProspectos] = useState<Prospecto[]>(prospectosIniciales);
  const [negocios, setNegocios] = useState<Expediente[]>(negociosIniciales);

  // Modo edición datos generales
  const [editando, setEditando] = useState(false);
  const [formData, setFormData] = useState<DatosEmpresa>({
    name: empresaInicial.name,
    industry: empresaInicial.industry,
    website: empresaInicial.website,
    phone: empresaInicial.phone,
    address: empresaInicial.address,
    billingAddress: empresaInicial.billingAddress,
    ownerId: empresaInicial.ownerId || "",
  });
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  // Pestaña derecha: "prospectos" | "negocios"
  const [tabActiva, setTabActiva] = useState<"prospectos" | "negocios">("prospectos");

  // Modal asociar prospecto existente
  const [modalAsociarPros, setModalAsociarPros] = useState(false);
  const [prosDisponibles, setProsDisponibles] = useState<{ id: string; nombre: string; telefono: string }[]>([]);
  const [prospectoSeleccionado, setProspectoSeleccionado] = useState("");
  const [cargandoProsDisp, setCargandoProsDisp] = useState(false);

  // Modal asociar negocio existente
  const [modalAsociarNeg, setModalAsociarNeg] = useState(false);
  const [negDisponibles, setNegDisponibles] = useState<{ id: string; cliente: string; fraccionamiento: string; etapa: string }[]>([]);
  const [negocioSeleccionado, setNegocioSeleccionado] = useState("");
  const [cargandoNegDisp, setCargandoNegDisp] = useState(false);

  // 1. Guardar cambios de datos generales
  async function handleGuardarDatosGenerales(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await actualizarEmpresa(empresa.id, formData);
      setEmpresa((prev) => ({
        ...prev,
        ...formData,
        ownerNombre: asesores.find((a) => a.id === formData.ownerId)?.nombre ?? null,
      }));
      setEditando(false);
      router.refresh();
    } catch (err: any) {
      alert("Error al actualizar la empresa: " + (err?.message || ""));
    } finally {
      setGuardando(false);
    }
  }

  // 2. Eliminar empresa
  async function handleEliminar() {
    if (!confirm(`¿Estás seguro de eliminar la empresa "${empresa.name}"? Los contactos y negocios asociados no se borrarán, pero se desvincularán de la cuenta.`)) {
      return;
    }
    setEliminando(true);
    try {
      await eliminarEmpresa(empresa.id);
      router.push("/empresas");
    } catch (err: any) {
      alert("Error al eliminar empresa: " + (err?.message || ""));
      setEliminando(false);
    }
  }

  // 3. Abrir modal asociar prospectos disponibles
  async function abrirModalAsociarProspecto() {
    setModalAsociarPros(true);
    setCargandoProsDisp(true);
    try {
      const lista = await listarProspectosDisponibles(empresa.id);
      setProsDisponibles(lista);
      if (lista.length > 0) setProspectoSeleccionado(lista[0].id);
    } catch {
      setProsDisponibles([]);
    } finally {
      setCargandoProsDisp(false);
    }
  }

  // 4. Confirmar asociar prospecto
  async function handleAsociarProspecto() {
    if (!prospectoSeleccionado) return;
    setGuardando(true);
    try {
      await asociarProspectoAEmpresa(prospectoSeleccionado, empresa.id);
      setModalAsociarPros(false);
      router.refresh();
      window.location.reload();
    } catch (err: any) {
      alert("Error al asociar prospecto: " + (err?.message || ""));
    } finally {
      setGuardando(false);
    }
  }

  // 5. Desasociar prospecto
  async function handleDesasociarProspecto(prospectoId: string, nombre: string) {
    if (!confirm(`¿Deseas desvincular al contacto "${nombre}" de esta empresa?`)) return;
    try {
      await asociarProspectoAEmpresa(prospectoId, null);
      setProspectos((prev) => prev.filter((p) => p.id !== prospectoId));
      router.refresh();
    } catch (err: any) {
      alert("Error al desvincular prospecto: " + (err?.message || ""));
    }
  }

  // 6. Abrir modal asociar negocios disponibles
  async function abrirModalAsociarNegocio() {
    setModalAsociarNeg(true);
    setCargandoNegDisp(true);
    try {
      const lista = await listarNegociosDisponibles(empresa.id);
      setNegDisponibles(lista);
      if (lista.length > 0) setNegocioSeleccionado(lista[0].id);
    } catch {
      setNegDisponibles([]);
    } finally {
      setCargandoNegDisp(false);
    }
  }

  // 7. Confirmar asociar negocio
  async function handleAsociarNegocio() {
    if (!negocioSeleccionado) return;
    setGuardando(true);
    try {
      await asociarNegocioAEmpresa(negocioSeleccionado, empresa.id);
      setModalAsociarNeg(false);
      router.refresh();
      window.location.reload();
    } catch (err: any) {
      alert("Error al asociar negocio: " + (err?.message || ""));
    } finally {
      setGuardando(false);
    }
  }

  // 8. Desasociar negocio
  async function handleDesasociarNegocio(expedienteId: string, cliente: string) {
    if (!confirm(`¿Deseas desvincular el negocio "${cliente}" (${expedienteId}) de esta empresa?`)) return;
    try {
      await asociarNegocioAEmpresa(expedienteId, null);
      setNegocios((prev) => prev.filter((n) => n.id !== expedienteId));
      router.refresh();
    } catch (err: any) {
      alert("Error al desvincular negocio: " + (err?.message || ""));
    }
  }

  const valorTotalDeals = negocios.reduce((acc, curr) => acc + (curr.valorEstimado || 0), 0);

  return (
    <div className="space-y-5">
      {/* Barra de Navegación y Encabezado 360° */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/empresas"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-sauce hover:text-verde-profundo transition"
        >
          <span>←</span>
          <span>Volver al Directorio de Empresas</span>
        </Link>
        <div className="flex items-center gap-2">
          {!editando && (
            <button
              onClick={() => setEditando(true)}
              className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-semibold text-carbon hover:border-sauce hover:text-sauce transition shadow-2xs"
            >
              ✏️ Editar Datos
            </button>
          )}
          <button
            onClick={handleEliminar}
            disabled={eliminando}
            className="rounded-lg border border-rojo/30 bg-rojo/5 px-3 py-1.5 text-xs font-semibold text-rojo hover:bg-rojo/10 transition shadow-2xs"
          >
            {eliminando ? "Eliminando..." : "🗑️ Eliminar"}
          </button>
        </div>
      </div>

      {/* Hero Card de la Empresa */}
      <div className="rounded-2xl border border-carbon/10 bg-white p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-verde-profundo text-2xl text-white shadow-md">
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-titular text-2xl font-bold text-carbon">
                {empresa.name}
              </h1>
              {empresa.industry && (
                <span className="rounded-full bg-verde-profundo/10 border border-verde-profundo/20 px-2.5 py-0.5 text-xs font-bold text-verde-profundo">
                  {empresa.industry}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-carbon/60 flex items-center gap-3 flex-wrap">
              <span className="font-mono text-[11px] bg-carbon/5 px-2 py-0.5 rounded text-carbon/70">
                ID: {empresa.id.slice(0, 8)}...
              </span>
              {empresa.phone && (
                <a href={`tel:${empresa.phone}`} className="hover:text-sauce">
                  📞 {empresa.phone}
                </a>
              )}
              {empresa.website && (
                <a
                  href={empresa.website.startsWith("http") ? empresa.website : `https://${empresa.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sauce hover:underline"
                >
                  🌐 {empresa.website}
                </a>
              )}
            </p>
          </div>
        </div>

        {/* Métricas Resumen */}
        <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-carbon/10 pt-3 sm:pt-0 sm:pl-6">
          <div className="text-center">
            <span className="text-[10px] uppercase tracking-wider text-carbon/50 font-bold block">
              Contactos
            </span>
            <span className="text-lg font-bold text-indigo-700">
              {prospectos.length}
            </span>
          </div>
          <div className="text-center">
            <span className="text-[10px] uppercase tracking-wider text-carbon/50 font-bold block">
              Negocios
            </span>
            <span className="text-lg font-bold text-amber-700">
              {negocios.length}
            </span>
          </div>
          <div className="text-center">
            <span className="text-[10px] uppercase tracking-wider text-carbon/50 font-bold block">
              Pipeline Total
            </span>
            <span className="text-lg font-bold font-mono text-verde-profundo">
              {formatoPesos(valorTotalDeals)}
            </span>
          </div>
        </div>
      </div>

      {/* Grid de 3 Columnas: Izquierda (Datos), Centro (Timeline), Derecha (Prospectos y Negocios) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ============================================================ */}
        {/* PANEL IZQUIERDO: Datos Generales, Contacto y Metadatos       */}
        {/* ============================================================ */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-carbon/10 pb-3 mb-4">
              <h2 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo">
                Datos de la Cuenta
              </h2>
              {editando && (
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="text-xs text-carbon/50 hover:text-carbon"
                >
                  Cancelar
                </button>
              )}
            </div>

            {editando ? (
              <form onSubmit={handleGuardarDatosGenerales} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-carbon/80 block mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-lg border border-carbon/20 p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-carbon/80 block mb-1">Industria</label>
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full rounded-lg border border-carbon/20 p-2 text-xs bg-white"
                  >
                    <option value="">Selecciona industria</option>
                    {INDUSTRIAS_COMUNES.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-carbon/80 block mb-1">Asesor Asignado</label>
                  <select
                    value={formData.ownerId || ""}
                    onChange={(e) => setFormData({ ...formData, ownerId: e.target.value || null })}
                    className="w-full rounded-lg border border-carbon/20 p-2 text-xs bg-white"
                  >
                    <option value="">Sin asignar</option>
                    {asesores.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-carbon/80 block mb-1">Sitio Web</label>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full rounded-lg border border-carbon/20 p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-carbon/80 block mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-lg border border-carbon/20 p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-carbon/80 block mb-1">Dirección Física</label>
                  <textarea
                    rows={2}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full rounded-lg border border-carbon/20 p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-carbon/80 block mb-1">Dirección Fiscal</label>
                  <textarea
                    rows={2}
                    value={formData.billingAddress}
                    onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                    className="w-full rounded-lg border border-carbon/20 p-2 text-xs"
                  />
                </div>
                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="submit"
                    disabled={guardando}
                    className="rounded-lg bg-sauce px-4 py-2 font-semibold text-white hover:bg-verde-profundo transition"
                  >
                    {guardando ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3.5 text-xs text-carbon">
                <div>
                  <span className="text-[10px] uppercase font-bold text-carbon/40 block">
                    Propietario / Asesor
                  </span>
                  <p className="mt-0.5 font-semibold text-carbon/80 flex items-center gap-1.5">
                    {empresa.ownerNombre ? (
                      <>
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-sauce text-[9px] font-bold text-white">
                          {empresa.ownerNombre.charAt(0)}
                        </span>
                        <span>{empresa.ownerNombre}</span>
                      </>
                    ) : (
                      <span className="text-carbon/40 italic">Sin asesor asignado</span>
                    )}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-carbon/40 block">
                    Teléfono Corporativo
                  </span>
                  {empresa.phone ? (
                    <a
                      href={`tel:${empresa.phone}`}
                      className="mt-0.5 font-medium text-sauce hover:underline block"
                    >
                      {empresa.phone}
                    </a>
                  ) : (
                    <span className="text-carbon/40 italic">No especificado</span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-carbon/40 block">
                    Sitio Web
                  </span>
                  {empresa.website ? (
                    <a
                      href={empresa.website.startsWith("http") ? empresa.website : `https://${empresa.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 font-medium text-sauce hover:underline break-all block"
                    >
                      {empresa.website} ↗
                    </a>
                  ) : (
                    <span className="text-carbon/40 italic">No especificado</span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-carbon/40 block">
                    Dirección de Oficinas
                  </span>
                  <p className="mt-0.5 text-carbon/70">
                    {empresa.address || <span className="italic text-carbon/40">No especificada</span>}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-carbon/40 block">
                    Dirección Fiscal (Facturación)
                  </span>
                  <p className="mt-0.5 text-carbon/70">
                    {empresa.billingAddress || <span className="italic text-carbon/40">No especificada</span>}
                  </p>
                </div>

                <div className="pt-3 border-t border-carbon/10 text-[11px] text-carbon/40 space-y-1">
                  <p>Registrada: {new Date(empresa.createdAt).toLocaleDateString()}</p>
                  <p>Actualizada: {new Date(empresa.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* PANEL CENTRAL: Línea de Tiempo (Timeline) de Actividades     */}
        {/* ============================================================ */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-carbon/10 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-carbon/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <h2 className="font-titular text-sm font-bold uppercase tracking-wider text-verde-profundo">
                  Bitácora & Actividades de la Cuenta
                </h2>
              </div>
            </div>
            {/* Componente Reutilizado Actividades con soporte empresaId */}
            <Actividades empresaId={empresa.id} />
          </div>
        </div>

        {/* ============================================================ */}
        {/* PANEL DERECHO: Pestañas de Prospectos y Negocios             */}
        {/* ============================================================ */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-carbon/10 bg-white shadow-xs overflow-hidden">
            {/* Selector de Pestañas */}
            <div className="flex border-b border-carbon/10 bg-carbon/5">
              <button
                type="button"
                onClick={() => setTabActiva("prospectos")}
                className={`flex-1 py-3 px-4 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  tabActiva === "prospectos"
                    ? "bg-white text-indigo-800 border-t-2 border-indigo-600 shadow-2xs"
                    : "text-carbon/60 hover:text-carbon"
                }`}
              >
                <span>👤 Contactos</span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700 font-mono">
                  {prospectos.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setTabActiva("negocios")}
                className={`flex-1 py-3 px-4 text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  tabActiva === "negocios"
                    ? "bg-white text-amber-800 border-t-2 border-amber-600 shadow-2xs"
                    : "text-carbon/60 hover:text-carbon"
                }`}
              >
                <span>📁 Negocios (Deals)</span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 font-mono">
                  {negocios.length}
                </span>
              </button>
            </div>

            <div className="p-4">
              {/* -------------------------------------------------------- */}
              {/* TAB 1: PROSPECTOS VINCULADOS                             */}
              {/* -------------------------------------------------------- */}
              {tabActiva === "prospectos" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-carbon/70 uppercase tracking-wider">
                      Personas en esta Empresa
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={abrirModalAsociarProspecto}
                        className="rounded border border-carbon/20 bg-white px-2 py-1 text-[11px] font-semibold text-carbon/70 hover:border-sauce hover:text-sauce transition"
                      >
                        + Vincular existente
                      </button>
                      <Link
                        href={`/prospectos/nuevo?empresa_id=${empresa.id}`}
                        className="rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 transition"
                      >
                        + Nuevo
                      </Link>
                    </div>
                  </div>

                  {prospectos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-carbon/20 p-6 text-center text-xs text-carbon/50">
                      <p>No hay contactos vinculados a esta empresa.</p>
                      <button
                        onClick={abrirModalAsociarProspecto}
                        className="mt-2 text-indigo-600 font-semibold hover:underline"
                      >
                        Asociar un prospecto existente
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-carbon/10">
                      {prospectos.map((p) => (
                        <div
                          key={p.id}
                          className="py-2.5 flex items-start justify-between gap-2 group hover:bg-carbon/5 px-2 rounded-lg transition"
                        >
                          <div>
                            <Link
                              href={`/prospectos/${p.id}`}
                              className="font-bold text-xs text-carbon hover:text-sauce transition block"
                            >
                              {p.nombreCompleto}
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-carbon/60 flex-wrap">
                              {p.telefono && (
                                <a href={`tel:${p.telefono}`} className="hover:text-sauce">
                                  📞 {p.telefono}
                                </a>
                              )}
                              {p.correo && (
                                <a href={`mailto:${p.correo}`} className="hover:text-sauce">
                                  ✉️ {p.correo}
                                </a>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <EstatusProspectoBadge estatus={p.estatus} />
                              <CalificacionProspectoBadge calificacion={p.calificacion} />
                            </div>
                          </div>
                          <button
                            onClick={() => handleDesasociarProspecto(p.id, p.nombreCompleto)}
                            className="text-carbon/30 hover:text-rojo text-xs p-1"
                            title="Desvincular de la empresa"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* TAB 2: NEGOCIOS (DEALS) VINCULADOS                       */}
              {/* -------------------------------------------------------- */}
              {tabActiva === "negocios" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-carbon/70 uppercase tracking-wider">
                      Oportunidades de Venta
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={abrirModalAsociarNegocio}
                        className="rounded border border-carbon/20 bg-white px-2 py-1 text-[11px] font-semibold text-carbon/70 hover:border-sauce hover:text-sauce transition"
                      >
                        + Vincular deal
                      </button>
                      <Link
                        href={`/expediente/nuevo?empresa_id=${empresa.id}`}
                        className="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 transition"
                      >
                        + Nuevo deal
                      </Link>
                    </div>
                  </div>

                  {negocios.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-carbon/20 p-6 text-center text-xs text-carbon/50">
                      <p>No hay negocios vinculados a esta cuenta corporativa.</p>
                      <button
                        onClick={abrirModalAsociarNegocio}
                        className="mt-2 text-amber-600 font-semibold hover:underline"
                      >
                        Asociar un negocio existente
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-carbon/10">
                      {negocios.map((neg) => (
                        <div
                          key={neg.id}
                          className="py-2.5 flex items-start justify-between gap-2 group hover:bg-carbon/5 px-2 rounded-lg transition"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/expediente/${neg.id}`}
                                className="font-bold text-xs text-carbon hover:text-sauce transition"
                              >
                                {neg.nombreCompleto || neg.cliente}
                              </Link>
                              <span className="font-mono text-[10px] text-carbon/50 bg-carbon/5 px-1.5 py-0.5 rounded">
                                {neg.id}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-[11px] flex-wrap">
                              <EtapaBadge etapa={neg.etapa} />
                              <span className="font-mono font-bold text-verde-profundo">
                                {formatoPesos(neg.valorEstimado)}
                              </span>
                            </div>

                            {/* Contacto específico asociado */}
                            {neg.prospectoId && (
                              <p className="mt-1 text-[10px] text-carbon/50">
                                Contacto:{" "}
                                <Link
                                  href={`/prospectos/${neg.prospectoId}`}
                                  className="text-indigo-600 hover:underline font-medium"
                                >
                                  Ver prospecto enlazado ↗
                                </Link>
                              </p>
                            )}
                          </div>

                          <button
                            onClick={() => handleDesasociarNegocio(neg.id, neg.nombreCompleto || neg.cliente)}
                            className="text-carbon/30 hover:text-rojo text-xs p-1"
                            title="Desvincular de la empresa"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ============================================================ */}
      {/* MODAL: ASOCIAR PROSPECTO EXISTENTE                           */}
      {/* ============================================================ */}
      {modalAsociarPros && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl border border-carbon/10">
            <h3 className="font-titular text-base font-bold text-carbon mb-1">
              Asociar Persona de Contacto
            </h3>
            <p className="text-xs text-carbon/60 mb-4">
              Selecciona un prospecto registrado para vincularlo a esta cuenta corporativa.
            </p>

            {cargandoProsDisp ? (
              <p className="text-xs text-carbon/50 py-4 text-center">Cargando prospectos disponibles...</p>
            ) : prosDisponibles.length === 0 ? (
              <p className="text-xs text-carbon/50 py-4 text-center">
                No hay otros prospectos disponibles para vincular.
              </p>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-carbon/80">
                  Seleccionar Prospecto:
                </label>
                <select
                  value={prospectoSeleccionado}
                  onChange={(e) => setProspectoSeleccionado(e.target.value)}
                  className="w-full rounded-lg border border-carbon/20 p-2 text-xs bg-white text-carbon"
                >
                  {prosDisponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.id}) {p.telefono ? `· ${p.telefono}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-carbon/10 pt-3">
              <button
                type="button"
                onClick={() => setModalAsociarPros(false)}
                className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs text-carbon/70 hover:bg-carbon/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando || prosDisponibles.length === 0}
                onClick={handleAsociarProspecto}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {guardando ? "Vinculando..." : "Vincular a Empresa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: ASOCIAR NEGOCIO EXISTENTE                             */}
      {/* ============================================================ */}
      {modalAsociarNeg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl border border-carbon/10">
            <h3 className="font-titular text-base font-bold text-carbon mb-1">
              Asociar Oportunidad de Venta (Negocio)
            </h3>
            <p className="text-xs text-carbon/60 mb-4">
              Selecciona un negocio/expediente para consolidarlo en esta empresa.
            </p>

            {cargandoNegDisp ? (
              <p className="text-xs text-carbon/50 py-4 text-center">Cargando negocios disponibles...</p>
            ) : negDisponibles.length === 0 ? (
              <p className="text-xs text-carbon/50 py-4 text-center">
                No hay otros negocios disponibles para vincular.
              </p>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-carbon/80">
                  Seleccionar Negocio:
                </label>
                <select
                  value={negocioSeleccionado}
                  onChange={(e) => setNegocioSeleccionado(e.target.value)}
                  className="w-full rounded-lg border border-carbon/20 p-2 text-xs bg-white text-carbon"
                >
                  {negDisponibles.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.cliente} ({n.id}) {n.fraccionamiento ? `· ${n.fraccionamiento}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-carbon/10 pt-3">
              <button
                type="button"
                onClick={() => setModalAsociarNeg(false)}
                className="rounded-lg border border-carbon/20 px-3 py-1.5 text-xs text-carbon/70 hover:bg-carbon/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando || negDisponibles.length === 0}
                onClick={handleAsociarNegocio}
                className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition disabled:opacity-50"
              >
                {guardando ? "Vinculando..." : "Vincular Negocio"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
