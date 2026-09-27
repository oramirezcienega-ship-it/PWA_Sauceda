"use client";

import { useState } from "react";
import {
  enviarNotificacionEntregaCliente,
  type OrdenTrabajo,
  type CartaGarantiaOT,
} from "@/app/actions/ordenes-trabajo";
import {
  PLANTILLA_ENTREGA_SERVICIO,
  generarMensajeEntregaDirecto,
} from "@/lib/meta-plantillas";
import type { RemisionFactura } from "@/lib/types";

interface ModalNotificarEntregaOTProps {
  abierto: boolean;
  alCerrar: () => void;
  alNotificar?: () => void;
  orden: OrdenTrabajo;
  garantia?: CartaGarantiaOT | null;
  remisionFactura?: RemisionFactura | null;
}

export function ModalNotificarEntregaOT({
  abierto,
  alCerrar,
  alNotificar,
  orden,
  garantia,
  remisionFactura,
}: ModalNotificarEntregaOTProps) {
  const [canal, setCanal] = useState<"whatsapp_api" | "whatsapp_web" | "email" | "meta_spec">("whatsapp_api");
  const [telefono, setTelefono] = useState(orden.clienteTelefono || "");
  const [correo, setCorreo] = useState(orden.clienteCorreo || "");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const fechaEntrega = orden.fechaConclusion
    ? new Date(orden.fechaConclusion).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : new Date().toLocaleDateString("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

  const urlBase = typeof window !== "undefined" ? window.location.origin : "https://crm.saucedamx.com";
  const urlEntrega = `${urlBase}/orden-trabajo/entrega/${orden.token}`;

  // Mensaje editable para WhatsApp Directo
  const [textoDirecto, setTextoDirecto] = useState(() =>
    generarMensajeEntregaDirecto({
      clienteNombre: orden.clienteNombre || "Cliente",
      folioOT: orden.folio,
      tituloOT: orden.titulo,
      fechaEntrega,
      tokenOT: orden.token,
      notasConclusion: orden.notasConclusion || "",
      urlBase,
      tokenCotizacion: orden.cotizacionToken,
      tokenGarantia: garantia?.token || undefined,
    })
  );

  if (!abierto) return null;

  const handleEnviarWhatsAppAPI = async () => {
    try {
      setEnviando(true);
      setResultado(null);
      const res = await enviarNotificacionEntregaCliente({
        ordenTrabajoId: orden.id,
        canal: "whatsapp_plantilla",
        telefonoDestino: telefono,
      });

      if (res.ok) {
        setResultado({
          tipo: "ok",
          texto: "¡Mensaje oficial enviado exitosamente por WhatsApp Cloud API de Meta!",
        });
        if (alNotificar) alNotificar();
      } else {
        setResultado({
          tipo: "error",
          texto:
            res.error ||
            "Error al enviar la plantilla. Si aún no está aprobada en Meta, puedes usar la pestaña 'WhatsApp Web / Directo'.",
        });
      }
    } catch (e: any) {
      setResultado({
        tipo: "error",
        texto: e?.message || "Ocurrió un error al contactar el servidor.",
      });
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviarEmail = async () => {
    try {
      setEnviando(true);
      setResultado(null);
      const res = await enviarNotificacionEntregaCliente({
        ordenTrabajoId: orden.id,
        canal: "email",
        correoDestino: correo,
      });

      if (res.ok) {
        setResultado({
          tipo: "ok",
          texto: `¡Correo electrónico de entrega oficial enviado exitosamente a ${correo}!`,
        });
        if (alNotificar) alNotificar();
      } else {
        setResultado({
          tipo: "error",
          texto: res.error || "No se pudo enviar el correo de entrega.",
        });
      }
    } catch (e: any) {
      setResultado({
        tipo: "error",
        texto: e?.message || "Ocurrió un error al contactar el servidor.",
      });
    } finally {
      setEnviando(false);
    }
  };

  const handleAbrirWhatsAppWeb = async () => {
    const telLimpio = telefono.replace(/[^0-9]/g, "");
    const waUrl = `https://wa.me/${telLimpio}?text=${encodeURIComponent(textoDirecto)}`;
    window.open(waUrl, "_blank");

    // Registrar trazabilidad de notificación
    await enviarNotificacionEntregaCliente({
      ordenTrabajoId: orden.id,
      canal: "whatsapp_directo",
      telefonoDestino: telefono,
    }).catch(() => {});

    if (alNotificar) alNotificar();
  };

  const handleCopiarPlantillaMeta = () => {
    const textoParaMeta = `NOMBRE: ${PLANTILLA_ENTREGA_SERVICIO.nombre}
CATEGORÍA: ${PLANTILLA_ENTREGA_SERVICIO.categoria}
IDIOMA: ${PLANTILLA_ENTREGA_SERVICIO.idioma}

ENCABEZADO:
${PLANTILLA_ENTREGA_SERVICIO.encabezado?.texto}

CUERPO:
${PLANTILLA_ENTREGA_SERVICIO.cuerpoTexto}

PIE DE PÁGINA:
${PLANTILLA_ENTREGA_SERVICIO.pieDePagina}

BOTÓN TIPO URL DINÁMICA:
Texto: ${PLANTILLA_ENTREGA_SERVICIO.botones[0].texto}
URL: ${PLANTILLA_ENTREGA_SERVICIO.botones[0].url}`;

    navigator.clipboard.writeText(textoParaMeta);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in font-cuerpo">
      <div className="relative w-full max-w-2xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-carbon/10 my-8">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📢</span>
            <div>
              <h3 className="font-titular text-lg font-bold text-verde-profundo leading-tight">
                Notificar Entrega al Cliente · {orden.folio}
              </h3>
              <p className="text-xs text-carbon/60">
                Envía el aviso oficial con evidencias, remisión/factura y póliza de garantía.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="text-carbon/40 hover:text-carbon text-lg font-bold p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {/* Pestañas de Selección de Canal */}
        <div className="flex flex-wrap gap-2 border-b border-carbon/10 py-3 mt-1">
          <button
            type="button"
            onClick={() => {
              setCanal("whatsapp_api");
              setResultado(null);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              canal === "whatsapp_api"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 text-carbon/70 hover:bg-slate-200"
            }`}
          >
            <span>⚡ WhatsApp Meta API</span>
            <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded-full uppercase">Oficial</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCanal("whatsapp_web");
              setResultado(null);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              canal === "whatsapp_web"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 text-carbon/70 hover:bg-slate-200"
            }`}
          >
            <span>📲 WhatsApp Web / App</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCanal("email");
              setResultado(null);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              canal === "email"
                ? "bg-sauce text-white shadow-xs"
                : "bg-slate-100 text-carbon/70 hover:bg-slate-200"
            }`}
          >
            <span>✉️ Correo Oficial</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCanal("meta_spec");
              setResultado(null);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              canal === "meta_spec"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-blue-50 text-blue-900 border border-blue-200 hover:bg-blue-100"
            }`}
          >
            <span>📋 Plantilla Meta (Business)</span>
          </button>
        </div>

        {/* Mensajes de Resultado / Alerta */}
        {resultado && (
          <div
            className={`p-3.5 rounded-xl text-xs font-semibold my-4 animate-fade-in ${
              resultado.tipo === "ok"
                ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                : "bg-rose-50 text-rose-900 border border-rose-200"
            }`}
          >
            {resultado.texto}
          </div>
        )}

        {/* Contenido según canal */}
        <div className="py-4">
          {/* CANAL 1: WHATSAPP CLOUD API (PLANTILLA META) */}
          {canal === "whatsapp_api" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">
                  Teléfono de WhatsApp del Cliente (10 dígitos o con lada 52):
                </label>
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej. 4771234567 o 524771234567"
                  className="w-full rounded-xl border border-carbon/20 p-2.5 text-xs text-carbon focus:border-sauce outline-none font-mono"
                />
              </div>

              {/* Previsualizador de Burbuja de WhatsApp */}
              <div>
                <span className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider block mb-2">
                  Previsualización de Plantilla Meta Cloud API ({PLANTILLA_ENTREGA_SERVICIO.nombre}):
                </span>
                <div className="bg-[#EFEAE2] p-4 rounded-2xl border border-carbon/10 max-w-md mx-auto shadow-inner">
                  <div className="bg-white rounded-2xl p-4 shadow-sm text-xs text-carbon space-y-2.5 relative">
                    <div className="flex items-center gap-1.5 text-verde-profundo font-bold border-b border-carbon/10 pb-1.5 text-[11px]">
                      <span>🛡️</span>
                      <span>{PLANTILLA_ENTREGA_SERVICIO.encabezado?.texto}</span>
                    </div>

                    <p className="leading-relaxed whitespace-pre-line text-carbon/90">
                      Estimado/a <strong className="text-carbon">{orden.clienteNombre || "Cliente"}</strong>, le confirmamos que los trabajos correspondientes a su orden <strong className="text-verde-profundo">{orden.folio}</strong> han sido concluidos exitosamente a entera satisfacción.
                    </p>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-carbon/5 text-[11px] space-y-1">
                      <p>📋 <strong>Proyecto:</strong> {orden.titulo}</p>
                      <p>📅 <strong>Fecha de entrega:</strong> {fechaEntrega}</p>
                    </div>

                    <p className="text-[11px] text-carbon/70">
                      Puede consultar su reporte de entrega, fotos de avance, remisión/factura y póliza de garantía en el siguiente enlace:
                    </p>

                    <div className="pt-2 border-t border-carbon/10">
                      <div className="w-full py-2 bg-slate-100 text-center rounded-xl text-xs font-bold text-emerald-700 flex items-center justify-center gap-1">
                        <span>🔗</span>
                        <span>Ver Reporte y Garantía</span>
                      </div>
                    </div>

                    <span className="text-[9px] text-carbon/40 block text-right">
                      {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-carbon/50 italic">
                  Requiere plantilla autorizada en Meta Business Manager.
                </p>
                <button
                  type="button"
                  onClick={handleEnviarWhatsAppAPI}
                  disabled={enviando || !telefono.trim()}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 shadow-xs transition flex items-center gap-2"
                >
                  <span>{enviando ? "Enviando vía Meta..." : "🚀 Enviar por WhatsApp API"}</span>
                </button>
              </div>
            </div>
          )}

          {/* CANAL 2: WHATSAPP WEB / DIRECTO */}
          {canal === "whatsapp_web" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">
                  Teléfono Destino:
                </label>
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej. 4771234567"
                  className="w-full rounded-xl border border-carbon/20 p-2.5 text-xs text-carbon focus:border-sauce outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">
                  Mensaje Formateado (Puedes editarlo antes de abrir WhatsApp):
                </label>
                <textarea
                  rows={8}
                  value={textoDirecto}
                  onChange={(e) => setTextoDirecto(e.target.value)}
                  className="w-full rounded-xl border border-carbon/20 p-3 text-xs text-carbon font-mono focus:border-sauce outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-carbon/50">
                  Abre WhatsApp Web o la App en tu dispositivo con el texto prellenado.
                </p>
                <button
                  type="button"
                  onClick={handleAbrirWhatsAppWeb}
                  disabled={!telefono.trim()}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 shadow-xs transition flex items-center gap-2"
                >
                  <span>📲 Abrir en WhatsApp</span>
                </button>
              </div>
            </div>
          )}

          {/* CANAL 3: CORREO ELECTRÓNICO */}
          {canal === "email" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">
                  Correo Electrónico del Cliente:
                </label>
                <input
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="cliente@ejemplo.com"
                  className="w-full rounded-xl border border-carbon/20 p-2.5 text-xs text-carbon focus:border-sauce outline-none"
                />
              </div>

              {/* Previsualización del Correo */}
              <div>
                <span className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider block mb-2">
                  Previsualización del Correo Corporativo:
                </span>
                <div className="rounded-2xl border border-carbon/15 bg-white p-4 max-h-64 overflow-y-auto shadow-inner text-xs space-y-3">
                  <div className="bg-verde-profundo text-white p-3 rounded-xl text-center">
                    <span className="font-titular font-bold tracking-widest uppercase text-xs">
                      SAUCEDA CONSTRUCCIÓN
                    </span>
                  </div>

                  <p>
                    Estimado/a <strong>{orden.clienteNombre || "Cliente"}</strong>:
                  </p>
                  <p className="text-carbon/80">
                    Le informamos que los trabajos correspondientes a <strong>"{orden.titulo}"</strong> de su orden <strong className="font-mono text-verde-profundo">{orden.folio}</strong> han finalizado a entera satisfacción el día <strong>{fechaEntrega}</strong>.
                  </p>

                  {orden.notasConclusion && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-sauce/20 text-carbon/80 italic">
                      "{orden.notasConclusion}"
                    </div>
                  )}

                  <div className="text-center py-2">
                    <span className="inline-block bg-verde-profundo text-white font-bold px-4 py-2 rounded-xl text-xs">
                      📂 Ver Reporte Digital de Entrega
                    </span>
                  </div>

                  <div className="border-t border-carbon/10 pt-2 text-[11px] text-carbon/60 space-y-1">
                    <p>✓ Remisión de Entrega / Factura disponible</p>
                    <p>✓ Póliza de Garantía de Calidad adjunta en portal</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-carbon/50">
                  Enviado mediante el servidor de correo corporativo.
                </p>
                <button
                  type="button"
                  onClick={handleEnviarEmail}
                  disabled={enviando || !correo.trim()}
                  className="rounded-xl bg-sauce hover:bg-sauce/90 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 shadow-xs transition flex items-center gap-2"
                >
                  <span>{enviando ? "Enviando correo..." : "📧 Enviar Correo Oficial"}</span>
                </button>
              </div>
            </div>
          )}

          {/* CANAL 4: ESPECIFICACIÓN PARA REGISTRO EN META */}
          {canal === "meta_spec" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 text-xs text-blue-950 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-titular font-bold text-sm text-blue-900">
                    Datos Técnicos para Registro en Meta Business Manager
                  </h4>
                  <button
                    type="button"
                    onClick={handleCopiarPlantillaMeta}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 transition shadow-2xs"
                  >
                    {copiado ? "✓ ¡Copiado!" : "📋 Copiar Ficha"}
                  </button>
                </div>

                <p className="text-blue-900/80 leading-relaxed">
                  Para activar el envío automático vía Cloud API, ingresa a tu <strong>Meta Business Manager &gt; Administrador de WhatsApp &gt; Plantillas de Mensaje</strong> y da de alta esta plantilla con los siguientes datos:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] bg-white p-3 rounded-xl border border-blue-200">
                  <div><strong>Nombre:</strong> {PLANTILLA_ENTREGA_SERVICIO.nombre}</div>
                  <div><strong>Categoría:</strong> {PLANTILLA_ENTREGA_SERVICIO.categoria}</div>
                  <div><strong>Idioma:</strong> Español (México) / es_MX</div>
                  <div><strong>Encabezado:</strong> Texto: "{PLANTILLA_ENTREGA_SERVICIO.encabezado?.texto}"</div>
                </div>

                <div>
                  <span className="font-bold block mb-1">Cuerpo del Mensaje (con variables):</span>
                  <pre className="p-3 bg-white rounded-xl border border-blue-200 font-mono text-[11px] whitespace-pre-wrap text-blue-900">
                    {PLANTILLA_ENTREGA_SERVICIO.cuerpoTexto}
                  </pre>
                </div>

                <div>
                  <span className="font-bold block mb-1">Botón de Acción:</span>
                  <div className="p-2.5 bg-white rounded-xl border border-blue-200 font-mono text-[11px]">
                    Tipo: <strong>URL (Dinámica)</strong> | Texto: <strong>"{PLANTILLA_ENTREGA_SERVICIO.botones[0].texto}"</strong> | URL: <strong>{PLANTILLA_ENTREGA_SERVICIO.botones[0].url}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pie del modal */}
        <div className="flex justify-end pt-3 border-t border-carbon/10">
          <button
            type="button"
            onClick={alCerrar}
            className="rounded-xl border border-carbon/20 px-4 py-2 text-xs font-semibold text-carbon/70 hover:bg-slate-50 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
