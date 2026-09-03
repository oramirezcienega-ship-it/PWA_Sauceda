"use client";

import { useEffect, useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { obtenerInfoContactoChatwoot, type InfoContactoWidget } from "@/app/actions/chatwoot";
import { formatearTelefonoLegible, obtenerTelLink } from "@/lib/telefono";

function WidgetContenido() {
  const searchParams = useSearchParams();
  const [telefono, setTelefono] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [nombreParam, setNombreParam] = useState<string>("");
  const [info, setInfo] = useState<InfoContactoWidget | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [isPending, startTransition] = useTransition();

  // 1. Leer parámetros de URL iniciales
  useEffect(() => {
    const qTel = searchParams?.get("telefono") || searchParams?.get("tel") || searchParams?.get("phone") || searchParams?.get("phone_number") || "";
    const qEmail = searchParams?.get("email") || "";
    const qName = searchParams?.get("name") || searchParams?.get("nombre") || "";

    if (qTel) setTelefono(qTel);
    if (qEmail) setEmail(qEmail);
    if (qName) setNombreParam(qName);
  }, [searchParams]);

  // 2. Escuchar eventos postMessage de Chatwoot Dashboard App SDK
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      try {
        let payload = event.data;
        if (typeof payload === "string") {
          try {
            payload = JSON.parse(payload);
          } catch {
            return;
          }
        }

        // Chatwoot pasa `event: 'appContext'` con `{ data: { contact: { phone_number, email, name } } }`
        const contact = payload?.data?.contact || payload?.contact;
        if (contact) {
          if (contact.phone_number) setTelefono(contact.phone_number);
          if (contact.email) setEmail(contact.email);
          if (contact.name) setNombreParam(contact.name);
        }
      } catch (err) {
        console.error("Error procesando mensaje de Chatwoot:", err);
      }
    }

    window.addEventListener("message", handleMessage);
    // Avisar a Chatwoot que el widget está listo
    window.parent.postMessage("chatwoot-dashboard-app:fetch-info", "*");

    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // 3. Consultar datos en Supabase cuando tengamos teléfono o email
  useEffect(() => {
    if (!telefono && !email) {
      setCargando(false);
      return;
    }

    setCargando(true);
    startTransition(async () => {
      try {
        const res = await obtenerInfoContactoChatwoot(telefono, email);
        setInfo(res);
      } catch (err) {
        console.error("Error al obtener info de contacto:", err);
      } finally {
        setCargando(false);
      }
    });
  }, [telefono, email]);

  if (cargando || isPending) {
    return (
      <div className="min-h-screen bg-crema/20 p-4 flex flex-col items-center justify-center text-center">
        <div className="w-8 h-8 border-3 border-sauce border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-medium text-carbon/60">Cargando datos del CRM...</p>
      </div>
    );
  }

  if (!telefono && !email) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex flex-col items-center justify-center text-center">
        <span className="text-3xl mb-2">💬</span>
        <h2 className="text-sm font-bold text-verde-profundo">Panel Lateral del CRM</h2>
        <p className="text-xs text-carbon/50 mt-1 max-w-xs">
          Abre una conversación en Chatwoot para ver automáticamente su expediente y cotizaciones.
        </p>
      </div>
    );
  }

  const nombreMostrar = info?.nombre || nombreParam || "Contacto";
  const telMostrar = info?.telefono || telefono;

  return (
    <div className="min-h-screen bg-slate-50/70 text-carbon p-3 space-y-3 text-xs font-sans">
      {/* Cabecera del Contacto */}
      <div className="bg-white rounded-xl p-3 border border-carbon/10 shadow-xs">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-titular font-bold text-sm text-verde-profundo truncate" title={nombreMostrar}>
              {nombreMostrar}
            </h1>
            <p className="font-mono text-xs font-semibold text-carbon/70 mt-0.5">
              {formatearTelefonoLegible(telMostrar)}
            </p>
            {info?.email && (
              <p className="text-[11px] text-carbon/50 truncate mt-0.5" title={info.email}>
                ✉️ {info.email}
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <a
              href={obtenerTelLink(telMostrar)}
              className="p-1.5 rounded-lg bg-sauce/15 hover:bg-sauce/25 text-verde-profundo transition text-sm"
              title="Llamar al cliente"
            >
              📞
            </a>
            <a
              href={`/conversaciones?tel=${encodeURIComponent(telMostrar)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg bg-carbon/5 hover:bg-carbon/10 text-carbon/70 transition text-sm"
              title="Abrir en Bandeja del CRM"
            >
              ↗️
            </a>
          </div>
        </div>

        {/* Tipo de Negocio detectado */}
        {info?.tipoNegocioLabel && (
          <div className="mt-2.5 pt-2 border-t border-carbon/5 flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-carbon/40">Servicio:</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sauce/15 text-verde-profundo border border-sauce/20">
              🏷️ {info.tipoNegocioLabel}
            </span>
          </div>
        )}
      </div>

      {/* Si NO está registrado en el CRM */}
      {!info?.encontrado && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center space-y-2">
          <p className="text-xs font-bold text-amber-900">Prospecto no registrado en el CRM</p>
          <p className="text-[11px] text-amber-900/70 leading-snug">
            Este número aún no tiene un expediente o prospecto creado en Supabase.
          </p>
          <a
            href={`/prospectos/nuevo?telefono=${encodeURIComponent(telMostrar)}&nombre=${encodeURIComponent(nombreMostrar)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full py-1.5 px-3 rounded-lg bg-verde-profundo hover:bg-verde-profundo/90 text-white font-bold text-xs shadow-xs transition"
          >
            + Crear Prospecto en CRM
          </a>
        </div>
      )}

      {/* Ficha de Expediente */}
      {info?.expediente && (
        <div className="bg-white rounded-xl p-3 border border-carbon/10 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-verde-profundo flex items-center gap-1">
              📁 Expediente de Obra
            </span>
            <a
              href={`/expediente/${info.expediente.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-sauce hover:underline font-mono flex items-center gap-0.5"
            >
              {info.expediente.id} ↗
            </a>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
            <div className="bg-crema/20 rounded-lg p-2">
              <span className="text-[10px] text-carbon/40 uppercase font-bold block">Etapa</span>
              <span className="font-semibold text-verde-profundo truncate block">{info.expediente.etapa}</span>
            </div>
            <div className="bg-crema/20 rounded-lg p-2">
              <span className="text-[10px] text-carbon/40 uppercase font-bold block">Asesor</span>
              <span className="font-semibold text-carbon/80 truncate block">{info.expediente.asesorNombre || "Sin asignar"}</span>
            </div>
          </div>

          {(info.expediente.total != null || info.expediente.saldo != null) && (
            <div className="flex items-center justify-between pt-1 text-[11px] border-t border-carbon/5">
              <span className="text-carbon/60">Monto total obra:</span>
              <span className="font-bold text-verde-profundo font-mono">
                ${info.expediente.total?.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <a
            href={`/expediente/${info.expediente.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-1.5 rounded-lg bg-carbon/5 hover:bg-carbon/10 text-verde-profundo font-bold text-[11px] transition"
          >
            Ver Expediente Completo →
          </a>
        </div>
      )}

      {/* Ficha de Prospecto (si no hay expediente aún) */}
      {!info?.expediente && info?.prospecto && (
        <div className="bg-white rounded-xl p-3 border border-carbon/10 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-cielo flex items-center gap-1">
              👤 Prospecto Activo
            </span>
            <a
              href={`/prospectos/${info.prospecto.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-bold text-cielo hover:underline font-mono"
            >
              {info.prospecto.id} ↗
            </a>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
            <div className="bg-slate-50 rounded-lg p-2">
              <span className="text-[10px] text-carbon/40 uppercase font-bold block">Etapa Venta</span>
              <span className="font-semibold text-carbon/80 truncate block">{info.prospecto.etapaVenta || "Nueva oportunidad"}</span>
            </div>
            <div className="bg-slate-50 rounded-lg p-2">
              <span className="text-[10px] text-carbon/40 uppercase font-bold block">Origen</span>
              <span className="font-semibold text-carbon/80 truncate block">{info.prospecto.origen || "WhatsApp"}</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <a
              href={`/prospectos/${info.prospecto.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center py-1.5 rounded-lg bg-cielo/10 hover:bg-cielo/20 text-cielo font-bold text-[11px] transition"
            >
              Ver Prospecto en CRM →
            </a>
          </div>
        </div>
      )}

      {/* Cotizaciones Activas */}
      {info && info.cotizaciones.length > 0 && (
        <div className="bg-white rounded-xl p-3 border border-carbon/10 shadow-xs space-y-2">
          <span className="font-bold text-xs text-verde-profundo block">
            📋 Cotizaciones ({info.cotizaciones.length})
          </span>
          <div className="space-y-1.5">
            {info.cotizaciones.map((c) => (
              <div key={c.id} className="p-2 rounded-lg bg-crema/10 border border-carbon/5 flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-[11px] text-verde-profundo">
                    {c.folio || "Sin Folio"}
                  </span>
                  <span className="text-[10px] text-carbon/50 block capitalize">
                    {c.estado} · {new Date(c.fecha).toLocaleDateString("es-MX")}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-xs text-verde-profundo block">
                    ${c.total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                  </span>
                  {c.token && (
                    <a
                      href={`/cotizacion/${c.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-sauce hover:underline"
                    >
                      Ver Portal ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Próxima Cita / Inspección */}
      {info?.proximaCita && (
        <div className="bg-sauce/10 border border-sauce/25 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-verde-profundo flex items-center gap-1">
              📅 Próxima Cita
            </span>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sauce/20 text-verde-profundo">
              {info.proximaCita.estado}
            </span>
          </div>
          <p className="font-semibold text-xs text-verde-profundo leading-tight">{info.proximaCita.titulo}</p>
          <p className="text-[11px] font-mono text-carbon/70">
            📆 {info.proximaCita.fecha} a las {info.proximaCita.hora}
          </p>
        </div>
      )}

      {/* Enlaces de Acceso Rápido */}
      <div className="pt-1 flex items-center gap-2">
        <a
          href="/agenda"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-1.5 text-center rounded-lg bg-white border border-carbon/15 hover:bg-slate-50 text-[11px] font-bold text-carbon/70 transition shadow-2xs"
        >
          📅 Agenda
        </a>
        <a
          href="/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-1.5 text-center rounded-lg bg-white border border-carbon/15 hover:bg-slate-50 text-[11px] font-bold text-carbon/70 transition shadow-2xs"
        >
          📊 Dashboard
        </a>
      </div>
    </div>
  );
}

export default function PaginaChatwootWidget() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-center text-carbon/50">Cargando panel...</div>}>
      <WidgetContenido />
    </Suspense>
  );
}
