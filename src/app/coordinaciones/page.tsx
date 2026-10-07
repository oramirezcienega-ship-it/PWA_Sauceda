"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  obtenerSeguimientoAsesores,
  listarLinksPortalAsesores,
  crearLinkPortalAsesor,
  regenerarLinkPortalAsesor,
  type LinkPortalAsesor,
} from "@/app/actions/seguimiento-asesores";
import type { CoordinacionPortal, LeadCompartidoPortal, Retroalimentacion } from "@/lib/portal-asesor-tipos";
import { exportarAExcelCSV } from "@/lib/finanzasExport";

type Pestana = "coordinaciones" | "clientes" | "links";

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "2-digit" });

const textoRetro = (r: Retroalimentacion | undefined) =>
  r
    ? [
        r.estadoLabel,
        r.clientePresente === null ? "" : `cliente ${r.clientePresente ? "estaba" : "no estaba"}`,
        r.siguientePaso ? `siguiente: ${r.siguientePaso}${r.siguientePasoFecha ? ` (${r.siguientePasoFecha})` : ""}` : "",
        r.comentario,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

const TONO_ESTADO: Record<string, string> = {
  confirmada: "bg-emerald-100 text-emerald-800",
  cancelada: "bg-red-100 text-red-700",
  enviado_cliente: "bg-blue-100 text-blue-800",
};

export default function PaginaCoordinaciones() {
  const [pestana, setPestana] = useState<Pestana>("coordinaciones");
  const [coordinaciones, setCoordinaciones] = useState<CoordinacionPortal[]>([]);
  const [leads, setLeads] = useState<LeadCompartidoPortal[]>([]);
  const [links, setLinks] = useState<LinkPortalAsesor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [filtroAsesor, setFiltroAsesor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [copiado, setCopiado] = useState("");

  const cargar = async () => {
    setCargando(true);
    setError("");
    try {
      const [seg, lnk] = await Promise.all([obtenerSeguimientoAsesores(), listarLinksPortalAsesores()]);
      setCoordinaciones(seg.coordinaciones);
      setLeads(seg.leads);
      setLinks(lnk);
    } catch (e: any) {
      setError(e.message || "No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  // Asesores que aparecen en coordinaciones o clientes (para el filtro)
  const asesores = useMemo(() => {
    const m = new Map<string, string>();
    coordinaciones.forEach((c) => c.asesores.forEach((a) => m.set(a.id, a.nombre)));
    leads.forEach((l) => m.set(l.asesorId, l.asesorNombre));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [coordinaciones, leads]);

  const coincide = (texto: string) => !busqueda || texto.toLowerCase().includes(busqueda.toLowerCase());

  const coordFiltradas = coordinaciones.filter(
    (c) =>
      (!filtroAsesor || c.asesores.some((a) => a.id === filtroAsesor)) &&
      (!filtroEstado ||
        (filtroEstado === "evaluando" ? ["evaluando", "propuesta_enviada"].includes(c.estado) : c.estado === filtroEstado)) &&
      coincide(`${c.clienteNombre} ${c.servicioNombre} ${c.fraccionamiento} ${c.ubicacion}`)
  );

  const leadsFiltrados = leads.filter(
    (l) =>
      (!filtroAsesor || l.asesorId === filtroAsesor) &&
      (!filtroEstado || (filtroEstado === "sin_respuesta" ? l.retro.length === 0 : l.retro[0]?.estado === filtroEstado)) &&
      coincide(`${l.clienteNombre} ${l.telefono} ${l.nota}`)
  );

  const exportar = () => {
    const hoy = new Date().toISOString().slice(0, 10);
    if (pestana === "coordinaciones") {
      exportarAExcelCSV(
        `Coordinaciones_Inspeccion_${hoy}`,
        ["Creada", "Cliente", "Teléfono", "Servicio", "Fraccionamiento", "Ubicación", "Asesores", "Respondieron", "Estado", "Horario confirmado", "Última retroalimentación", "Asesor que respondió", "Fecha respuesta"],
        coordFiltradas.map((c) => [
          fechaCorta(c.createdAt),
          c.clienteNombre,
          c.clienteTelefono,
          c.servicioNombre,
          c.fraccionamiento,
          c.ubicacion,
          c.asesores.map((a) => a.nombre).join(", "),
          c.asesores.filter((a) => a.respondio).map((a) => a.nombre).join(", "),
          c.estadoLabel,
          c.horarioConfirmado || "",
          textoRetro(c.retro[0]),
          c.retro[0]?.asesorNombre || "",
          c.retro[0] ? fechaCorta(c.retro[0].createdAt) : "",
        ])
      );
    } else {
      exportarAExcelCSV(
        `Clientes_Compartidos_${hoy}`,
        ["Compartido", "Cliente", "Teléfono", "Asesor", "Compartido por", "Nota", "Última retroalimentación", "Fecha respuesta", "Respuestas"],
        leadsFiltrados.map((l) => [
          fechaCorta(l.createdAt),
          l.clienteNombre,
          l.telefono,
          l.asesorNombre,
          l.enviadoPor,
          l.nota,
          textoRetro(l.retro[0]) || "Sin respuesta",
          l.retro[0] ? fechaCorta(l.retro[0].createdAt) : "",
          l.retro.length,
        ])
      );
    }
  };

  const copiar = async (texto: string, clave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado(""), 2000);
    } catch {
      window.prompt("Copia el link:", texto);
    }
  };

  const mensajeLink = (l: LinkPortalAsesor) =>
    `Hola ${l.nombre.split(" ")[0]} 👋 Este es tu link personal del portal de Sauceda. Ahí ves tus coordinaciones de inspección y los clientes que te compartimos, y nos das retroalimentación (sin usuario ni contraseña). Guárdalo en tu celular:\n${l.url}`;

  const accionLink = async (l: LinkPortalAsesor, regenerar: boolean) => {
    if (regenerar && !confirm(`¿Generar un link nuevo para ${l.nombre}? El link anterior dejará de funcionar.`)) return;
    const r = regenerar ? await regenerarLinkPortalAsesor(l.asesorId) : await crearLinkPortalAsesor(l.asesorId);
    if (!r.ok) return alert(r.error || "No se pudo generar el link.");
    setLinks((prev) => prev.map((x) => (x.asesorId === l.asesorId ? { ...x, url: r.url || null } : x)));
  };

  const pendientesRespuesta = coordinaciones.filter((c) => ["propuesta_enviada", "evaluando"].includes(c.estado)).length;
  const leadsSinRespuesta = leads.filter((l) => l.retro.length === 0).length;

  return (
    <main className="min-h-screen pb-16 bg-slate-50/50">
      <div className="mx-auto w-full max-w-[1920px] px-4 sm:px-6 xl:px-8 py-6 space-y-5">
        <div className="rounded-2xl border border-sauce/30 bg-gradient-to-r from-verde-profundo via-verde-profundo to-emerald-950 p-6 text-crema shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">📋</span>
              <span className="font-mono text-xs uppercase tracking-wider text-dorado font-bold">
                Seguimiento de asesores
              </span>
            </div>
            <h1 className="font-titular text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Coordinaciones de Inspección
            </h1>
            <p className="text-xs sm:text-sm text-crema/80 font-cuerpo mt-1">
              Coordinaciones y clientes compartidos con la retroalimentación que dan los asesores desde su link personal
            </p>
          </div>
          {pestana !== "links" && (
            <button
              type="button"
              onClick={exportar}
              disabled={(pestana === "coordinaciones" ? coordFiltradas : leadsFiltrados).length === 0}
              className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white font-semibold px-3.5 py-2.5 text-xs transition flex items-center gap-2 disabled:opacity-50"
            >
              <span>📥</span>
              <span>Exportar Excel</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "coordinaciones" as const, label: "Coordinaciones", n: pendientesRespuesta },
            { id: "clientes" as const, label: "Clientes compartidos", n: leadsSinRespuesta },
            { id: "links" as const, label: "Links de asesores", n: 0 },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setPestana(t.id);
                setFiltroEstado("");
              }}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                pestana === t.id ? "bg-[#2D4A2B] text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
              {t.n > 0 && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] text-slate-900">{t.n}</span>}
            </button>
          ))}

          {pestana !== "links" && (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, servicio…"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs w-52"
              />
              <select
                value={filtroAsesor}
                onChange={(e) => setFiltroAsesor(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="">Todos los asesores</option>
                {asesores.map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="">Todos los estados</option>
                {pestana === "coordinaciones" ? (
                  <>
                    <option value="evaluando">Esperando asesores</option>
                    <option value="enviado_cliente">Enviada al cliente</option>
                    <option value="confirmada">Confirmada</option>
                    <option value="cancelada">Cancelada</option>
                  </>
                ) : (
                  <>
                    <option value="sin_respuesta">Sin respuesta</option>
                    <option value="contactado">Ya lo contactó</option>
                    <option value="no_contesta">No contesta</option>
                    <option value="cotizado">Cotizado</option>
                    <option value="cerrado">Cerrado</option>
                    <option value="no_interesa">No le interesa</option>
                    <option value="no_puedo_atender">No lo puede atender</option>
                  </>
                )}
              </select>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          {cargando ? (
            <p className="py-16 text-center text-xs text-slate-400">Cargando…</p>
          ) : pestana === "coordinaciones" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                    <th className="py-3 px-4">Cliente / Servicio</th>
                    <th className="py-3 px-3">Ubicación</th>
                    <th className="py-3 px-3">Asesores</th>
                    <th className="py-3 px-3">Estado</th>
                    <th className="py-3 px-3">Horario</th>
                    <th className="py-3 px-3 min-w-[260px]">Retroalimentación</th>
                    <th className="py-3 px-3">Creada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coordFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        Sin coordinaciones con estos filtros.
                      </td>
                    </tr>
                  )}
                  {coordFiltradas.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/60 align-top">
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-800">{c.clienteNombre}</div>
                        <div className="text-[11px] text-slate-500">{c.servicioNombre}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {[c.fraccionamiento, c.ubicacion].filter((x) => x && x !== "Por definir").join(" · ") || "Por definir"}
                      </td>
                      <td className="py-2.5 px-3">
                        {c.asesores.map((a) => (
                          <div key={a.id} className="whitespace-nowrap">
                            <span className={a.respondio ? "text-emerald-600" : "text-slate-300"}>{a.respondio ? "●" : "○"}</span>{" "}
                            {a.nombre}
                          </div>
                        ))}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${TONO_ESTADO[c.estado] || "bg-amber-100 text-amber-800"}`}>
                          {c.estadoLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-700">{c.horarioConfirmado || "—"}</td>
                      <td className="py-2.5 px-3">
                        <CeldaRetro retro={c.retro} />
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">{fechaCorta(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : pestana === "clientes" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-3">Asesor</th>
                    <th className="py-3 px-3">Nota al compartir</th>
                    <th className="py-3 px-3 min-w-[280px]">Retroalimentación</th>
                    <th className="py-3 px-3">Compartido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leadsFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        Sin clientes compartidos con estos filtros.
                      </td>
                    </tr>
                  )}
                  {leadsFiltrados.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/60 align-top">
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-800">{l.clienteNombre}</div>
                        <div className="text-[11px] text-slate-500">{l.telefono}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="text-slate-700">{l.asesorNombre}</div>
                        <div className="text-[10px] text-slate-400">por {l.enviadoPor || "—"}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[260px]">{l.nota || "—"}</td>
                      <td className="py-2.5 px-3">
                        <CeldaRetro retro={l.retro} />
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">{fechaCorta(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <p className="px-4 py-3 text-[11px] text-slate-500 bg-slate-50">
                Cada asesor entra con su link, sin usuario ni contraseña. Mándaselo una vez para que lo guarde en su celular. Si un link
                se comparte por error, genera uno nuevo y el anterior deja de funcionar.
              </p>
              {links.map((l) => (
                <div key={l.asesorId} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-[180px]">
                    <div className="text-sm font-bold text-slate-800">{l.nombre}</div>
                    <div className="text-[10px] uppercase text-slate-400">{l.rol}</div>
                  </div>
                  {l.url ? (
                    <>
                      <code className="flex-1 min-w-[200px] truncate rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        {l.url}
                      </code>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => copiar(l.url!, l.asesorId)}
                          className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700"
                        >
                          {copiado === l.asesorId ? "¡Copiado!" : "Copiar"}
                        </button>
                        <a
                          href={`https://wa.me/${l.telefono.replace(/\D/g, "").length === 10 ? "52" : ""}${l.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(mensajeLink(l))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700"
                        >
                          WhatsApp
                        </a>
                        <a
                          href={`https://t.me/share/url?url=${encodeURIComponent(l.url)}&text=${encodeURIComponent(mensajeLink(l).replace(`\n${l.url}`, ""))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-sky-50 hover:bg-sky-100 px-2.5 py-1.5 text-[11px] font-bold text-sky-700"
                        >
                          Telegram
                        </a>
                        <Link
                          href={l.url.replace(/^https?:\/\/[^/]+/, "")}
                          target="_blank"
                          className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700"
                        >
                          Ver
                        </Link>
                        <button
                          type="button"
                          onClick={() => accionLink(l, true)}
                          className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50"
                        >
                          Regenerar
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => accionLink(l, false)}
                      className="rounded-lg bg-[#2D4A2B] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#5C7A52]"
                    >
                      Crear link
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function CeldaRetro({ retro }: { retro: Retroalimentacion[] }) {
  const [verTodo, setVerTodo] = useState(false);
  if (retro.length === 0) return <span className="text-[11px] text-amber-600 font-bold">Sin respuesta</span>;
  const lista = verTodo ? retro : retro.slice(0, 1);
  return (
    <div className="space-y-1.5">
      {lista.map((r) => (
        <div key={r.id}>
          <span className="font-bold text-slate-800">{r.estadoLabel}</span>
          <span className="text-[10px] text-slate-400">
            {" "}
            · {r.asesorNombre} · {fechaCorta(r.createdAt)}
          </span>
          {(r.clientePresente !== null || r.siguientePaso || r.comentario) && (
            <div className="text-[11px] text-slate-600">
              {textoRetro({ ...r, estadoLabel: "" })}
            </div>
          )}
        </div>
      ))}
      {retro.length > 1 && (
        <button type="button" onClick={() => setVerTodo(!verTodo)} className="text-[10px] font-bold text-blue-700">
          {verTodo ? "Ver menos" : `Ver historial (${retro.length})`}
        </button>
      )}
    </div>
  );
}
