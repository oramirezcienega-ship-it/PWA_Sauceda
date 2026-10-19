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
import {
  WHATSAPP_EMPRESA,
  type CoordinacionPortal,
  type LeadCompartidoPortal,
  type Retroalimentacion,
} from "@/lib/portal-asesor-tipos";
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

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const pesos = (n: number) =>
  n ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }) : "";

const soloDigitos = (t: string) => (t || "").replace(/\D/g, "");
const telWa = (t: string) => {
  const d = soloDigitos(t);
  return d.length === 10 ? `52${d}` : d;
};

const origenApp = () => (typeof window !== "undefined" ? window.location.origin : "");

/** Ficha del cliente compartido para reenviarla al asesor por WhatsApp o Telegram. */
function mensajeLead(l: LeadCompartidoPortal, urlPortal: string | null): string {
  const d = l.detalle;
  const app = origenApp();
  const ubicacion = Array.from(new Set([d?.direccion, d?.fraccionamiento].filter(Boolean))).join(", ");
  const lineas = [
    `👤 *Cliente: ${l.clienteNombre}*`,
    soloDigitos(l.telefono).length >= 10 ? `📞 ${l.telefono} · https://wa.me/${telWa(l.telefono)}` : l.telefono ? `📞 ${l.telefono}` : "",
    d?.correo ? `✉️ ${d.correo}` : "",
    d?.tipoNegocio ? `💼 Negocio: ${d.tipoNegocio}${d.etapa ? ` (${d.etapa})` : ""}` : "",
    ubicacion ? `📍 ${ubicacion}` : "",
    d?.tipoCredito ? `🏦 Crédito: ${d.tipoCredito}` : "",
    d?.valorEstimado ? `💰 Valor estimado: ${pesos(d.valorEstimado)}` : "",
    d?.montoCotizado ? `🧾 Cotizado: ${pesos(d.montoCotizado)} (${d.cotizaciones} cotización${d.cotizaciones === 1 ? "" : "es"})` : "",
    d?.necesidad ? `📝 Necesidad: ${d.necesidad}` : "",
    l.nota ? `📌 Nota: ${l.nota}` : "",
    l.resumen ? `\n*Resumen:*\n${l.resumen}` : "",
    l.retro[0] ? `\n🔁 Última retro: ${textoRetro(l.retro[0])}` : "",
    d?.expedienteId && app ? `\n🔗 Expediente: ${app}/expediente/${d.expedienteId}` : "",
    d?.ultimaCotizacion?.token && app ? `🔗 Cotización: ${app}/cotizacion/${d.ultimaCotizacion.token}` : "",
    `\nCompartido el ${fechaHora(l.createdAt)}${l.enviadoPor ? ` por ${l.enviadoPor}` : ""}`,
    urlPortal || soloDigitos(l.telefono).length >= 10
      ? `\n✍️ *Dar retro de este cliente:* ${linkRetroCliente(l, urlPortal)}`
      : "",
  ];
  return lineas.filter(Boolean).join("\n").slice(0, 3800);
}

/**
 * Link para dar retro de un cliente en particular: la ficha del cliente en el portal del
 * asesor (sin contraseña). Si el asesor aún no tiene link del portal, el chat de la empresa
 * con "RETRO <teléfono>" (lo entiende lib/retro-whatsapp).
 */
const linkRetroCliente = (l: LeadCompartidoPortal, urlPortal: string | null) =>
  urlPortal
    ? `${urlPortal}/cliente/${l.id}`
    : `https://wa.me/${WHATSAPP_EMPRESA}?text=${encodeURIComponent(
        `RETRO ${soloDigitos(l.telefono).slice(-10)} (${l.clienteNombre.replace(/[()]/g, "").trim()})`
      )}`;

/** Lista de clientes compartidos de un asesor, con el link para dar retro por WhatsApp (texto o audio). */
function mensajeListaAsesor(nombre: string, lista: LeadCompartidoPortal[], urlPortal: string | null): string {
  // El mismo cliente compartido varias veces va una sola vez (el envío más reciente)
  const vistos = new Set<string>();
  const unicos = lista.filter((l) => {
    const clave = soloDigitos(l.telefono).slice(-10) || l.id;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
  const renglones = unicos.map((l) => {
    const d = l.detalle;
    const valor = d?.montoCotizado
      ? `Cotizado ${pesos(d.montoCotizado)}${d.ultimaCotizacion ? ` (${d.ultimaCotizacion.id})` : ""}`
      : d?.valorEstimado
        ? `Valor ${pesos(d.valorEstimado)}`
        : "";
    return [
      `• *${l.clienteNombre}* · ${l.telefono}`,
      d?.tipoNegocio ? `   ${d.tipoNegocio}${d.etapa ? ` · ${d.etapa}` : ""}` : "",
      d?.fraccionamiento || d?.direccion ? `   📍 ${d.fraccionamiento || d.direccion}` : "",
      valor ? `   💰 ${valor}` : "",
      `   🔁 ${l.retro[0] ? textoRetro(l.retro[0]) : "Sin respuesta"}`,
      urlPortal || soloDigitos(l.telefono).length >= 10 ? `   👉 *Dar retro:* ${linkRetroCliente(l, urlPortal)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  const linkRetro = `https://wa.me/${WHATSAPP_EMPRESA}?text=RETRO`;
  const encabezado = [
    `Hola ${nombre.split(" ")[0]} 👋 Estos son los clientes que te compartimos (${unicos.length}) y cómo los tenemos.`,
    "",
    urlPortal
      ? `👉 Toca *Dar retro* en cada cliente: se abre su ficha, eliges el estatus y dictas o escribes cómo vas (sin contraseña).`
      : `🎙️ *Danos tu retro aquí:* ${linkRetro}\n(o toca *Dar retro* en cada cliente y mándame un audio o texto con cómo vas)`,
  ].join("\n");
  const pie = [
    urlPortal ? `📲 Todos tus clientes: ${urlPortal}` : "",
    `🎙️ ¿Prefieres mandar un audio? Escríbenos aquí: ${linkRetro}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Se recorta la lista de clientes, nunca los links: WhatsApp corta los mensajes muy largos
  const LIMITE = 3500;
  let cuerpo = "";
  let incluidos = 0;
  for (const r of renglones) {
    const siguiente = cuerpo ? `${cuerpo}\n\n${r}` : r;
    if (encabezado.length + siguiente.length + pie.length + 80 > LIMITE) break;
    cuerpo = siguiente;
    incluidos++;
  }
  const faltan = renglones.length - incluidos;
  if (faltan > 0) cuerpo += `\n\n…y ${faltan} cliente${faltan === 1 ? "" : "s"} más${urlPortal ? " (todos en tu portal)" : ""}.`;

  return [encabezado, "", cuerpo, "", pie].join("\n").trim();
}

const CLAVE_FILTROS = "coordinaciones:filtros";

/** Inicio y fin (ms, fin exclusivo) del periodo elegido; null = sin límite. */
function rangoPeriodo(periodo: string, desde: string, hasta: string): [number | null, number | null] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dia = 86400000;
  const h = hoy.getTime();
  switch (periodo) {
    case "hoy":
      return [h, null];
    case "ayer":
      return [h - dia, h];
    case "7":
    case "15":
    case "30":
      return [h - (Number(periodo) - 1) * dia, null];
    case "mes":
      return [new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime(), null];
    case "rango":
      return [
        desde ? new Date(`${desde}T00:00:00`).getTime() : null,
        hasta ? new Date(`${hasta}T00:00:00`).getTime() + dia : null,
      ];
    default:
      return [null, null];
  }
}
const esReciente = (iso: string) => Date.now() - new Date(iso).getTime() < 86400000;

const TONO_ESTADO: Record<string, string> = {
  confirmada: "bg-emerald-100 text-emerald-800",
  cancelada: "bg-red-100 text-red-700",
  enviado_cliente: "bg-blue-100 text-blue-800",
};

export default function PaginaCoordinaciones() {
  const [pestana, setPestana] = useState<Pestana>("clientes");
  const [coordinaciones, setCoordinaciones] = useState<CoordinacionPortal[]>([]);
  const [leads, setLeads] = useState<LeadCompartidoPortal[]>([]);
  const [links, setLinks] = useState<LinkPortalAsesor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [filtroAsesor, setFiltroAsesor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroPeriodo, setFiltroPeriodo] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [copiado, setCopiado] = useState("");
  const [verEnvioListas, setVerEnvioListas] = useState(false);
  const [filtrosListos, setFiltrosListos] = useState(false);

  // Filtros y pestaña se guardan en el navegador para que sobrevivan al refrescar
  useEffect(() => {
    try {
      const f = JSON.parse(localStorage.getItem(CLAVE_FILTROS) || "{}");
      if (["coordinaciones", "clientes", "links"].includes(f.pestana)) setPestana(f.pestana);
      if (typeof f.filtroAsesor === "string") setFiltroAsesor(f.filtroAsesor);
      if (typeof f.filtroEstado === "string") setFiltroEstado(f.filtroEstado);
      if (typeof f.busqueda === "string") setBusqueda(f.busqueda);
      if (typeof f.filtroPeriodo === "string") setFiltroPeriodo(f.filtroPeriodo);
      if (typeof f.fechaDesde === "string") setFechaDesde(f.fechaDesde);
      if (typeof f.fechaHasta === "string") setFechaHasta(f.fechaHasta);
    } catch {}
    setFiltrosListos(true);
  }, []);

  useEffect(() => {
    if (!filtrosListos) return;
    try {
      localStorage.setItem(
        CLAVE_FILTROS,
        JSON.stringify({ pestana, filtroAsesor, filtroEstado, busqueda, filtroPeriodo, fechaDesde, fechaHasta })
      );
    } catch {}
  }, [filtrosListos, pestana, filtroAsesor, filtroEstado, busqueda, filtroPeriodo, fechaDesde, fechaHasta]);

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
  const [inicioPeriodo, finPeriodo] = rangoPeriodo(filtroPeriodo, fechaDesde, fechaHasta);
  const enPeriodo = (iso: string) => {
    const t = new Date(iso).getTime();
    return (!inicioPeriodo || t >= inicioPeriodo) && (!finPeriodo || t < finPeriodo);
  };

  const coordFiltradas = coordinaciones.filter(
    (c) =>
      enPeriodo(c.createdAt) &&
      (!filtroAsesor || c.asesores.some((a) => a.id === filtroAsesor)) &&
      (!filtroEstado ||
        (filtroEstado === "evaluando" ? ["evaluando", "propuesta_enviada"].includes(c.estado) : c.estado === filtroEstado)) &&
      coincide(`${c.clienteNombre} ${c.servicioNombre} ${c.fraccionamiento} ${c.ubicacion}`)
  );

  const leadsFiltrados = leads.filter(
    (l) =>
      enPeriodo(l.createdAt) &&
      (!filtroAsesor || l.asesorId === filtroAsesor) &&
      (!filtroEstado ||
        (filtroEstado === "sin_respuesta"
          ? l.retro.length === 0
          : filtroEstado === "retro_nueva"
            ? Boolean(l.retro[0] && esReciente(l.retro[0].createdAt))
            : l.retro[0]?.estado === filtroEstado)) &&
      coincide(
        `${l.clienteNombre} ${l.telefono} ${l.nota} ${l.detalle?.tipoNegocio || ""} ${l.detalle?.fraccionamiento || ""} ${l.detalle?.expedienteId || ""}`
      )
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
        ["Compartido", "Cliente", "Teléfono", "Correo", "Expediente", "Prospecto", "Tipo de negocio", "Etapa", "Fraccionamiento", "Valor estimado", "Cotizado", "Asesor", "Compartido por", "Nota", "Última retroalimentación", "Fecha respuesta", "Respuestas"],
        leadsFiltrados.map((l) => [
          fechaHora(l.createdAt),
          l.clienteNombre,
          l.telefono,
          l.detalle?.correo || "",
          l.detalle?.expedienteId || "",
          l.detalle?.prospectoId || "",
          l.detalle?.tipoNegocio || "",
          l.detalle?.etapa || "",
          l.detalle?.fraccionamiento || "",
          l.detalle?.valorEstimado || "",
          l.detalle?.montoCotizado || "",
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

  // Clientes filtrados agrupados por asesor, para mandarle a cada uno su lista
  const listasPorAsesor = (() => {
    const m = new Map<string, LeadCompartidoPortal[]>();
    leadsFiltrados.forEach((l) => m.set(l.asesorId, [...(m.get(l.asesorId) || []), l]));
    return Array.from(m.entries())
      .map(([id, lista]) => {
        const link = links.find((x) => x.asesorId === id);
        const telefono = link?.telefono || lista.find((l) => l.detalle?.asesorTelefono)?.detalle?.asesorTelefono || "";
        const nombre = lista[0].asesorNombre || link?.nombre || "Asesor";
        const clientes = new Set(lista.map((l) => soloDigitos(l.telefono).slice(-10) || l.id)).size;
        return { id, nombre, telefono, lista, clientes, mensaje: mensajeListaAsesor(nombre, lista, link?.url || null) };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  })();

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
                value={filtroPeriodo}
                onChange={(e) => setFiltroPeriodo(e.target.value)}
                title={pestana === "clientes" ? "Fecha en que se compartió" : "Fecha en que se creó"}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="">Cualquier fecha</option>
                <option value="hoy">Hoy</option>
                <option value="ayer">Ayer</option>
                <option value="7">Últimos 7 días</option>
                <option value="15">Últimos 15 días</option>
                <option value="30">Últimos 30 días</option>
                <option value="mes">Este mes</option>
                <option value="rango">Rango de fechas…</option>
              </select>
              {filtroPeriodo === "rango" && (
                <>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    title="Desde"
                    className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  />
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    title="Hasta"
                    className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs"
                  />
                </>
              )}
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
                    <option value="retro_nueva">Retro nueva (24 h)</option>
                    <option value="contactado">Ya lo contactó</option>
                    <option value="no_contesta">No contesta</option>
                    <option value="cotizado">Cotizado</option>
                    <option value="cerrado">Cerrado</option>
                    <option value="no_interesa">No le interesa</option>
                    <option value="no_puedo_atender">No lo puede atender</option>
                  </>
                )}
              </select>
              {pestana === "clientes" && (
                <button
                  type="button"
                  onClick={() => setVerEnvioListas(!verEnvioListas)}
                  disabled={listasPorAsesor.length === 0}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  📤 Enviar lista a asesores
                </button>
              )}
            </div>
          )}
        </div>

        {pestana === "clientes" && verEnvioListas && (
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-2xs divide-y divide-slate-100">
            <p className="px-4 py-3 text-[11px] text-slate-600 bg-emerald-50/60 rounded-t-2xl">
              A cada asesor le llega la lista de sus clientes (con los filtros actuales) y un link al WhatsApp de la empresa: manda{" "}
              <b>RETRO</b> y dicta un audio o escribe cómo va con cada cliente. La IA lo registra aquí como retroalimentación
              (marcada con 🎙️ WhatsApp).
            </p>
            {listasPorAsesor.map((a) => (
              <div key={a.id} className="px-4 py-2.5 flex flex-wrap items-center gap-3">
                <div className="min-w-[200px] flex-1">
                  <div className="text-sm font-bold text-slate-800">{a.nombre}</div>
                  <div className="text-[11px] text-slate-500">
                    {a.clientes} clientes · {a.lista.filter((l) => l.retro.length === 0).length} sin respuesta
                    {!a.telefono && <span className="text-amber-600"> · sin teléfono (elige el chat en WhatsApp)</span>}
                    {!links.find((x) => x.asesorId === a.id)?.url && (
                      <span className="text-amber-600">
                        {" "}
                        · sin link del portal (la retro irá por chat){" "}
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await crearLinkPortalAsesor(a.id);
                            if (!r.ok) return alert(r.error || "No se pudo crear el link.");
                            setLinks((prev) => prev.map((x) => (x.asesorId === a.id ? { ...x, url: r.url || null } : x)));
                          }}
                          className="font-bold text-blue-700 hover:underline"
                        >
                          Crear link
                        </button>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <a
                    href={`https://wa.me/${a.telefono ? telWa(a.telefono) : ""}?text=${encodeURIComponent(a.mensaje)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700"
                  >
                    WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => copiar(a.mensaje, `lista-${a.id}`)}
                    className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700"
                  >
                    {copiado === `lista-${a.id}` ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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
                    <th className="py-3 px-3">Negocio</th>
                    <th className="py-3 px-3">Valor</th>
                    <th className="py-3 px-3">Asesor</th>
                    <th className="py-3 px-3">Nota al compartir</th>
                    <th className="py-3 px-3 min-w-[240px]">Retroalimentación</th>
                    <th className="py-3 px-3">Compartido</th>
                    <th className="py-3 px-3">Enviar al asesor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leadsFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        Sin clientes compartidos con estos filtros.
                      </td>
                    </tr>
                  )}
                  {leadsFiltrados.map((l) => {
                    const d = l.detalle;
                    const msg = mensajeLead(l, links.find((x) => x.asesorId === l.asesorId)?.url || null);
                    const app = origenApp();
                    return (
                      <tr key={l.id} className="hover:bg-slate-50/60 align-top">
                        <td className="py-2.5 px-4">
                          <div className="font-bold text-slate-800">{l.clienteNombre}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            {l.telefono}
                            {soloDigitos(l.telefono).length >= 10 && (
                              <a
                                href={`https://wa.me/${telWa(l.telefono)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir chat con el cliente"
                                className="text-emerald-600 hover:underline"
                              >
                                chat
                              </a>
                            )}
                          </div>
                          {d?.correo && <div className="text-[10px] text-slate-400">{d.correo}</div>}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {d?.expedienteId && (
                              <Link
                                href={`/expediente/${d.expedienteId}`}
                                className="rounded bg-[#2D4A2B]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#2D4A2B] hover:bg-[#2D4A2B]/20"
                              >
                                Negocio {d.expedienteId} →
                              </Link>
                            )}
                            {d?.prospectoId && (
                              <Link
                                href={`/prospectos/${d.prospectoId}`}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200"
                              >
                                Prospecto →
                              </Link>
                            )}
                            {l.telefono && (
                              <Link
                                href={`/conversaciones?tel=${encodeURIComponent(l.telefono)}`}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200"
                              >
                                Conversación →
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 max-w-[220px]">
                          {d?.tipoNegocio ? (
                            <>
                              <div className="font-semibold text-slate-700">{d.tipoNegocio}</div>
                              {d.etapa && (
                                <span className="inline-block mt-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                                  {d.etapa}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-300">Sin negocio</span>
                          )}
                          {(d?.fraccionamiento || d?.direccion) && (
                            <div className="text-[10px] text-slate-500 mt-0.5">📍 {d.fraccionamiento || d.direccion}</div>
                          )}
                          {d?.necesidad && (
                            <div className="text-[10px] text-slate-400 line-clamp-2" title={d.necesidad}>
                              {d.necesidad}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {d?.valorEstimado ? <div className="font-bold text-slate-800">{pesos(d.valorEstimado)}</div> : null}
                          {d?.montoCotizado ? (
                            <div className="text-[10px] text-emerald-700 font-semibold">Cotizado {pesos(d.montoCotizado)}</div>
                          ) : null}
                          {d?.ultimaCotizacion && (
                            <a
                              href={`/cotizacion/${d.ultimaCotizacion.token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-[10px] text-blue-700 hover:underline"
                            >
                              {d.ultimaCotizacion.id} · {d.ultimaCotizacion.estatus.replace(/_/g, " ")}
                            </a>
                          )}
                          {!d?.valorEstimado && !d?.cotizaciones && <span className="text-slate-300">—</span>}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="text-slate-700">{l.asesorNombre}</div>
                          <div className="text-[10px] text-slate-400">por {l.enviadoPor || "—"}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[220px]">{l.nota || "—"}</td>
                        <td className="py-2.5 px-3">
                          <CeldaRetro retro={l.retro} />
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">{fechaHora(l.createdAt)}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1 min-w-[150px]">
                            <a
                              href={`https://wa.me/${d?.asesorTelefono ? telWa(d.asesorTelefono) : ""}?text=${encodeURIComponent(msg)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={d?.asesorTelefono ? `Enviar a ${l.asesorNombre}` : "El asesor no tiene teléfono: elige el chat en WhatsApp"}
                              className="rounded-lg bg-emerald-50 hover:bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-700"
                            >
                              WhatsApp
                            </a>
                            <a
                              href={`https://t.me/share/url?url=${encodeURIComponent(
                                d?.expedienteId && app ? `${app}/expediente/${d.expedienteId}` : `https://wa.me/${telWa(l.telefono)}`
                              )}&text=${encodeURIComponent(msg)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-sky-50 hover:bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-700"
                            >
                              Telegram
                            </a>
                            <button
                              type="button"
                              onClick={() => copiar(msg, `lead-${l.id}`)}
                              className="rounded-lg bg-slate-100 hover:bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700"
                            >
                              {copiado === `lead-${l.id}` ? "¡Copiado!" : "Copiar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
          {r.origen === "whatsapp" && (
            <span className="ml-1 rounded bg-emerald-50 px-1 text-[9px] font-bold text-emerald-700">🎙️ WhatsApp</span>
          )}
          {esReciente(r.createdAt) && (
            <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800">Nueva</span>
          )}
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
