"use client";

import { useEffect, useState } from "react";
import {
  enviarNotificacionEntregaCliente,
  type OrdenTrabajo,
  type CartaGarantiaOT,
} from "@/app/actions/ordenes-trabajo";
import {
  consultarEstadoPlantillasEntrega,
  consultarVentanaWhatsApp,
} from "@/app/actions/whatsapp";
import {
  PLANTILLA_ENTREGA_SERVICIO,
  generarMensajeEntregaDirecto,
} from "@/lib/meta-plantillas";
import type { RemisionFactura } from "@/lib/types";
import { normalizarTelefono } from "@/lib/telefono";
import { obtenerMarcaServicio } from "@/lib/marca-servicio";

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
  const [modoEnvioMeta, setModoEnvioMeta] = useState<"libre" | "plantilla">("libre");
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<
    "entrega_documentos_remision_garantia" | "sauceda_entrega_servicio"
  >("entrega_documentos_remision_garantia");

  const [plantillasMeta, setPlantillasMeta] = useState<
    Array<{ name: string; status: string; category: string; language: string; id?: string }>
  >([]);
  const [cargandoPlantillas, setCargandoPlantillas] = useState(false);

  // Estado de la ventana de 24 horas de WhatsApp
  const [estadoVentana, setEstadoVentana] = useState<{
    cargando: boolean;
    abierta: boolean;
    horasRestantes?: number;
    minutosRestantes?: number;
    ultimoTexto?: string;
    fechaUltimo?: string;
  }>({ cargando: true, abierta: false });

  const [telefono, setTelefono] = useState(orden.clienteTelefono || "");
  const [correo, setCorreo] = useState(orden.clienteCorreo || "");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Observaciones técnicas y recomendaciones del técnico
  const [notasConclusion, setNotasConclusion] = useState(orden.notasConclusion || "");

  // Selección de fotos / evidencias para enviar directamente
  const fotosEvidenciaLista = (orden.fotosEvidencia || []).filter(
    (f) => !f.url.toLowerCase().endsWith(".mp4")
  );
  const [fotosSeleccionadas, setFotosSeleccionadas] = useState<string[]>(() =>
    fotosEvidenciaLista.map((f) => f.url)
  );

  // Tarea de cotización de seguimiento en el expediente
  const esCalentador =
    (orden.tipoNegocio || "").includes("calentador") ||
    (orden.titulo || "").toLowerCase().includes("calentador");
  const [detonarTarea, setDetonarTarea] = useState(true);
  const [tituloTarea, setTituloTarea] = useState(
    esCalentador
      ? `Cotizar reemplazo de termotanque solar (${orden.clienteNombre || "Cliente"} - ${orden.folio})`
      : `Cotizar seguimiento según observaciones técnicas (${orden.clienteNombre || "Cliente"} - ${orden.folio})`
  );
  const [descripcionTarea, setDescripcionTarea] = useState(
    esCalentador
      ? `Durante el servicio de mantenimiento en ${orden.folio}, el especialista detectó desgaste y corrosión en el termotanque. Elaborar y enviar propuesta económica para reemplazo de termotanque nuevo.`
      : `Derivado de las observaciones de entrega de ${orden.folio}, dar seguimiento y elaborar propuesta económica correspondiente.`
  );
  const [diasVencimiento, setDiasVencimiento] = useState(1);

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
  const urlRemision = orden.cotizacionToken
    ? `${urlBase}/cotizacion/remision/${orden.cotizacionToken}`
    : `${urlBase}/orden-trabajo/remision/${orden.token}`;
  const urlGarantia = garantia?.token ? `${urlBase}/garantia/${garantia.token}` : "";

  // Generador de texto para el mensaje libre
  const construirTextoMensaje = (notas?: string) => {
    return generarMensajeEntregaDirecto({
      clienteNombre: orden.clienteNombre || "Cliente",
      folioOT: orden.folio,
      tituloOT: orden.titulo,
      fechaEntrega,
      tokenOT: orden.token,
      notasConclusion: notas !== undefined ? notas : notasConclusion,
      urlBase,
      tokenCotizacion: orden.cotizacionToken,
      tokenGarantia: garantia?.token || undefined,
      incluirRemisionOT: true,
    });
  };

  const [textoLibre, setTextoLibre] = useState(() => construirTextoMensaje(orden.notasConclusion || ""));
  const [editadoManualmente, setEditadoManualmente] = useState(false);

  // Actualizar texto libre cuando cambian las notas si no ha sido editado a mano
  const handleCambioNotas = (nuevasNotas: string) => {
    setNotasConclusion(nuevasNotas);
    if (!editadoManualmente) {
      setTextoLibre(construirTextoMensaje(nuevasNotas));
    }
  };

  const aplicarSugerenciaTanque = () => {
    const sugerencia =
      "Observación técnica del especialista: Se concluyó el mantenimiento preventivo completo; sin embargo, durante la revisión y limpieza interna se detectó desgaste y corrosión avanzada en el termotanque, por lo que recomendamos programar su reemplazo próximo para prevenir fugas y pérdida de presión. En breve te compartiremos la propuesta económica correspondiente.";
    setNotasConclusion(sugerencia);
    setTextoLibre(construirTextoMensaje(sugerencia));
    setEditadoManualmente(false);
  };

  // Consultar estado de plantillas en Meta y estado de la ventana de 24h
  const cargarEstadoInicial = async () => {
    try {
      setCargandoPlantillas(true);
      setEstadoVentana((prev) => ({ ...prev, cargando: true }));

      // 1. Consultar estado de ventana de 24 horas
      const resVentana = await consultarVentanaWhatsApp(telefono || orden.clienteTelefono || "");
      if (resVentana.ok) {
        setEstadoVentana({
          cargando: false,
          abierta: resVentana.ventanaAbierta,
          horasRestantes: resVentana.horasRestantes,
          minutosRestantes: resVentana.minutosRestantes,
          ultimoTexto: resVentana.ultimoMensajeCliente,
          fechaUltimo: resVentana.fechaUltimoMensaje,
        });
        // Si la ventana está abierta, sugerir por defecto mensaje libre
        if (resVentana.ventanaAbierta) {
          setModoEnvioMeta("libre");
        } else {
          setModoEnvioMeta("plantilla");
        }
      } else {
        setEstadoVentana({ cargando: false, abierta: false });
        setModoEnvioMeta("plantilla");
      }

      // 2. Consultar plantillas en Meta
      const resP = await consultarEstadoPlantillasEntrega();
      if (resP.ok && resP.plantillas) {
        setPlantillasMeta(resP.plantillas);
        const nuevaPlantilla = resP.plantillas.find((p) => p.name === "sauceda_entrega_servicio");
        if (nuevaPlantilla && nuevaPlantilla.status === "APPROVED") {
          setPlantillaSeleccionada("sauceda_entrega_servicio");
        }
      }
    } catch (err) {
      console.error("Error al cargar estado inicial:", err);
      setEstadoVentana({ cargando: false, abierta: false });
    } finally {
      setCargandoPlantillas(false);
    }
  };

  useEffect(() => {
    if (abierto) {
      cargarEstadoInicial();
    }
  }, [abierto]);

  if (!abierto) return null;

  const statusNueva = plantillasMeta.find((p) => p.name === "sauceda_entrega_servicio")?.status || "PENDING";
  const statusAprobada =
    plantillasMeta.find((p) => p.name === "entrega_documentos_remision_garantia")?.status || "APPROVED";

  const handleEnviarWhatsAppAPI = async () => {
    try {
      setEnviando(true);
      setResultado(null);

      const res = await enviarNotificacionEntregaCliente({
        ordenTrabajoId: orden.id,
        canal: modoEnvioMeta === "libre" ? "whatsapp_libre" : "whatsapp_plantilla",
        telefonoDestino: telefono,
        plantillaNombre: plantillaSeleccionada,
        mensajeLibre: textoLibre,
        fotosUrls: fotosSeleccionadas,
        notasConclusion: notasConclusion,
        tareaCotizacion: detonarTarea
          ? {
              crear: true,
              titulo: tituloTarea,
              descripcion: descripcionTarea,
              diasVencimiento,
            }
          : undefined,
      });

      if (res.ok) {
        const detalleFotos =
          fotosSeleccionadas.length > 0 ? ` con ${fotosSeleccionadas.length} foto(s) de evidencia adjuntas` : "";
        const detalleTarea = detonarTarea ? " y se detonó la tarea de cotización en el expediente" : "";
        setResultado({
          tipo: "ok",
          texto: `¡Notificación enviada exitosamente por WhatsApp Cloud API${detalleFotos}${detalleTarea}!`,
        });
        if (alNotificar) alNotificar();
      } else {
        setResultado({
          tipo: "error",
          texto:
            res.error ||
            "Error al entregar mensaje por Meta Cloud API. Verifica el teléfono o prueba la plantilla aprobada.",
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
        notasConclusion: notasConclusion,
        tareaCotizacion: detonarTarea
          ? {
              crear: true,
              titulo: tituloTarea,
              descripcion: descripcionTarea,
              diasVencimiento,
            }
          : undefined,
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
    const telLimpio = normalizarTelefono(telefono);
    const waUrl = `https://wa.me/${telLimpio}?text=${encodeURIComponent(textoLibre)}`;
    window.open(waUrl, "_blank");

    await enviarNotificacionEntregaCliente({
      ordenTrabajoId: orden.id,
      canal: "whatsapp_directo",
      telefonoDestino: telefono,
      notasConclusion: notasConclusion,
      tareaCotizacion: detonarTarea
        ? {
            crear: true,
            titulo: tituloTarea,
            descripcion: descripcionTarea,
            diasVencimiento,
          }
        : undefined,
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

  const toggleFoto = (url: string) => {
    setFotosSeleccionadas((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 backdrop-blur-xs p-4 overflow-y-auto animate-fade-in font-cuerpo">
      <div className="relative w-full max-w-3xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-carbon/10 my-8">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📢</span>
            <div>
              <h3 className="font-titular text-lg font-bold text-verde-profundo leading-tight">
                Notificar Entrega al Cliente · {orden.folio}
              </h3>
              <p className="text-xs text-carbon/60">
                Envío oficial con evidencias de obra, recomendaciones técnicas y detonación de tareas.
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
            <span>⚡ Meta Cloud API (Oficial)</span>
            <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded-full uppercase">API</span>
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
            <span>📱 WhatsApp Web / Directo</span>
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
            <span>📋 Estado de Plantillas Meta</span>
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
        <div className="py-4 space-y-5">
          {/* CANAL 1: WHATSAPP CLOUD API INTELIGENTE */}
          {canal === "whatsapp_api" && (
            <div className="space-y-4">
              {/* BANNER INTELIGENTE DE DETECCIÓN DE VENTANA DE 24 HORAS */}
              <div
                className={`p-3.5 rounded-2xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  estadoVentana.cargando
                    ? "bg-slate-50 border-slate-200 text-slate-700"
                    : estadoVentana.abierta
                    ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                    : "bg-amber-50 border-amber-200 text-amber-950"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">
                    {estadoVentana.cargando ? "⏳" : estadoVentana.abierta ? "🟢" : "🔒"}
                  </span>
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      {estadoVentana.cargando
                        ? "Verificando ventana de conversación de WhatsApp..."
                        : estadoVentana.abierta
                        ? `Ventana de 24 Horas ABIERTA (restan aprox. ${estadoVentana.horasRestantes}h ${estadoVentana.minutosRestantes}m)`
                        : "Ventana de 24 Horas CERRADA (> 24 h sin respuesta del cliente)"}
                    </div>
                    <p className="text-[11px] text-carbon/70">
                      {estadoVentana.abierta
                        ? "El cliente escribió recientemente. Puedes enviar un mensaje libre enriquecido y adjuntar fotos directamente al chat sin costo de plantilla."
                        : "El cliente no ha escrito en las últimas 24 horas. Meta exige usar una plantilla oficial aprobada para reactivar la conversación."}
                    </p>
                  </div>
                </div>

                {/* Switch / Selector de modo si la ventana está abierta */}
                {estadoVentana.abierta && (
                  <div className="flex items-center bg-white rounded-xl border border-carbon/15 p-1 shrink-0 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setModoEnvioMeta("libre")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        modoEnvioMeta === "libre"
                          ? "bg-emerald-600 text-white"
                          : "text-carbon/60 hover:text-carbon"
                      }`}
                    >
                      💬 Mensaje Libre
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoEnvioMeta("plantilla")}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        modoEnvioMeta === "plantilla"
                          ? "bg-emerald-600 text-white"
                          : "text-carbon/60 hover:text-carbon"
                      }`}
                    >
                      📋 Plantilla Meta
                    </button>
                  </div>
                )}
              </div>

              {/* Teléfono Destino */}
              <div>
                <label className="block text-xs font-bold text-carbon/80 mb-1">
                  Teléfono del Cliente (Destinatario WhatsApp):
                </label>
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej. 4771234567 o 524771234567"
                  className="w-full rounded-xl border border-carbon/20 p-2.5 text-xs text-carbon focus:border-sauce outline-none font-mono"
                />
              </div>

              {/* SECCIÓN 1: OBSERVACIONES TÉCNICAS Y RECOMENDACIÓN DEL TÉCNICO */}
              <div className="rounded-2xl border border-carbon/15 bg-slate-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-verde-profundo flex items-center gap-1.5">
                    <span>🛠️</span>
                    <span>Observaciones Técnicas y Recomendaciones del Especialista:</span>
                  </label>
                  {esCalentador && (
                    <button
                      type="button"
                      onClick={aplicarSugerenciaTanque}
                      className="text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-lg transition flex items-center gap-1"
                      title="Insertar recomendación de reemplazo de termotanque solar"
                    >
                      <span>💡 Recomendar cambio de tanque</span>
                    </button>
                  )}
                </div>
                <textarea
                  rows={3}
                  value={notasConclusion}
                  onChange={(e) => handleCambioNotas(e.target.value)}
                  placeholder="Ej. Durante el servicio preventivo se detectó desgaste y corrosión en el termotanque, por lo que recomendamos programar su reemplazo..."
                  className="w-full rounded-xl border border-carbon/20 p-2.5 text-xs text-carbon focus:border-sauce outline-none bg-white font-sans"
                />
                <p className="text-[10px] text-carbon/50">
                  Estas observaciones se guardan permanentemente en la Orden de Trabajo y se adjuntan automáticamente al reporte y mensaje.
                </p>
              </div>

              {/* SECCIÓN 2: SELECCIÓN DE FOTOS / EVIDENCIAS DIRECTAS AL CHAT */}
              {fotosEvidenciaLista.length > 0 && (
                <div className="rounded-2xl border border-carbon/15 bg-white p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-carbon/80 flex items-center gap-1.5">
                      <span>📸</span>
                      <span>Adjuntar Fotos de Evidencia directamente en WhatsApp ({fotosSeleccionadas.length}/{fotosEvidenciaLista.length}):</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFotosSeleccionadas(fotosEvidenciaLista.map((f) => f.url))}
                        className="text-[10px] text-emerald-700 font-bold hover:underline"
                      >
                        Todas
                      </button>
                      <span className="text-carbon/20">|</span>
                      <button
                        type="button"
                        onClick={() => setFotosSeleccionadas([])}
                        className="text-[10px] text-rose-700 font-bold hover:underline"
                      >
                        Ninguna
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                    {fotosEvidenciaLista.map((foto, idx) => {
                      const sel = fotosSeleccionadas.includes(foto.url);
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleFoto(foto.url)}
                          className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition aspect-square bg-slate-100 group ${
                            sel ? "border-emerald-600 ring-2 ring-emerald-500/20" : "border-carbon/10 opacity-50 hover:opacity-80"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={foto.url}
                            alt={`Evidencia ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-1 right-1">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shadow-xs ${
                                sel ? "bg-emerald-600 text-white" : "bg-white text-carbon/40 border border-carbon/20"
                              }`}
                            >
                              {sel ? "✓" : ""}
                            </span>
                          </div>
                          <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1 py-0.2 rounded font-mono">
                            Foto {idx + 1}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-carbon/50">
                    Las fotos seleccionadas se enviarán directamente al chat del cliente para que las vea de inmediato al recibir su reporte.
                  </p>
                </div>
              )}

              {/* SECCIÓN 3: DETONAR TAREA DE NUEVA COTIZACIÓN EN EL EXPEDIENTE */}
              <div className="rounded-2xl border border-amber-300/80 bg-amber-50/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={detonarTarea}
                      onChange={(e) => setDetonarTarea(e.target.checked)}
                      className="h-4 w-4 rounded text-sauce focus:ring-sauce accent-sauce cursor-pointer"
                    />
                    <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <span>📋</span>
                      <span>Detonar tarea en Expediente: Enviar nueva cotización de reemplazo</span>
                    </span>
                  </label>
                  <span className="text-[10px] bg-amber-200/80 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                    Oportunidad de Venta
                  </span>
                </div>

                {detonarTarea && (
                  <div className="space-y-2 pt-1.5 animate-fade-in text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-carbon/70 mb-0.5">
                        Título de la Tarea en el CRM:
                      </label>
                      <input
                        type="text"
                        value={tituloTarea}
                        onChange={(e) => setTituloTarea(e.target.value)}
                        className="w-full rounded-xl border border-carbon/20 p-2 text-xs text-carbon focus:border-sauce outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-carbon/70 mb-0.5">
                        Instrucciones / Observaciones para la cotización:
                      </label>
                      <textarea
                        rows={2}
                        value={descripcionTarea}
                        onChange={(e) => setDescripcionTarea(e.target.value)}
                        className="w-full rounded-xl border border-carbon/20 p-2 text-xs text-carbon focus:border-sauce outline-none bg-white font-sans"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-carbon/70">
                      <span>Fecha límite de entrega:</span>
                      <select
                        value={diasVencimiento}
                        onChange={(e) => setDiasVencimiento(parseInt(e.target.value, 10))}
                        className="rounded-lg border border-carbon/20 p-1 text-xs bg-white font-bold text-carbon"
                      >
                        <option value={1}>Mañana (en 24 horas)</option>
                        <option value={2}>En 2 días</option>
                        <option value={3}>En 3 días</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* SECCIÓN 4: SI MODO ES PLANTILLA, SELECTOR DE PLANTILLA META */}
              {modoEnvioMeta === "plantilla" && (
                <div>
                  <label className="block text-xs font-bold text-carbon/80 mb-1.5">
                    Selecciona la Plantilla de Meta a disparar:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Opción A: entrega_documentos_remision_garantia (APROBADA) */}
                    <div
                      onClick={() => setPlantillaSeleccionada("entrega_documentos_remision_garantia")}
                      className={`cursor-pointer rounded-2xl p-3 border transition ${
                        plantillaSeleccionada === "entrega_documentos_remision_garantia"
                          ? "border-emerald-600 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-600"
                          : "border-carbon/15 bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-emerald-950 font-mono">
                          entrega_documentos...
                        </span>
                        <span className="rounded-full bg-emerald-200 text-emerald-900 text-[9px] font-bold px-2 py-0.5">
                          ✓ {statusAprobada}
                        </span>
                      </div>
                      <p className="text-[11px] text-carbon/70 leading-snug">
                        Plantilla corporativa activa en Meta. Envía saludo, ligas completas a documentos y redes sociales.
                      </p>
                    </div>

                    {/* Opción B: sauceda_entrega_servicio */}
                    <div
                      onClick={() => setPlantillaSeleccionada("sauceda_entrega_servicio")}
                      className={`cursor-pointer rounded-2xl p-3 border transition ${
                        plantillaSeleccionada === "sauceda_entrega_servicio"
                          ? "border-emerald-600 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-600"
                          : "border-carbon/15 bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-blue-950 font-mono">
                          sauceda_entrega_servicio
                        </span>
                        <span
                          className={`rounded-full text-[9px] font-bold px-2 py-0.5 ${
                            statusNueva === "APPROVED"
                              ? "bg-emerald-200 text-emerald-900"
                              : "bg-amber-200 text-amber-900"
                          }`}
                        >
                          {statusNueva === "APPROVED" ? "✓ APROBADA" : "⏳ EN REVISIÓN"}
                        </span>
                      </div>
                      <p className="text-[11px] text-carbon/70 leading-snug">
                        Nueva plantilla UTILITY enviada a Meta con botón dinámico personalizado hacia el portal de entrega.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* SIMULADOR DE PANTALLA WHATSAPP REALISTA (VISUALIZACIÓN) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-carbon/50 uppercase tracking-wider block">
                    {modoEnvioMeta === "libre"
                      ? "Visualización Exacta del Mensaje Libre en WhatsApp:"
                      : "Visualización Exacta en WhatsApp de la Plantilla:"}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                    {modoEnvioMeta === "libre" ? "Meta Cloud API · Mensaje Libre" : "Meta Cloud API · Plantilla"}
                  </span>
                </div>

                {/* Marco de Pantalla WhatsApp */}
                <div className="rounded-2xl overflow-hidden border border-carbon/20 shadow-md max-w-md mx-auto">
                  {/* Barra Superior WhatsApp */}
                  <div className="bg-[#075E54] text-white px-3.5 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-verde-profundo text-white font-bold flex items-center justify-center text-xs border border-white/20">
                        S
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-xs text-white">SAUCEDA Construcción</span>
                          <span className="text-emerald-300 text-[10px]" title="Empresa Verificada">
                            ✓
                          </span>
                        </div>
                        <p className="text-[9px] text-emerald-100">Cuenta comercial oficial</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-200 font-mono">WhatsApp</span>
                  </div>

                  {/* Área de Chat con Fondo Clásico */}
                  <div className="bg-[#EFEAE2] p-4 min-h-[220px] flex flex-col justify-end space-y-2">
                    {/* Burbujas de fotos enviadas si las hay */}
                    {fotosSeleccionadas.length > 0 && (
                      <div className="ml-auto max-w-[85%] bg-white rounded-2xl p-2 shadow-xs border border-black/5 space-y-1">
                        <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden">
                          {fotosSeleccionadas.slice(0, 4).map((f, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={f}
                              alt="Evidencia"
                              className="w-full h-16 object-cover"
                            />
                          ))}
                        </div>
                        <p className="text-[10px] text-carbon/70 italic px-1">
                          📸 {fotosSeleccionadas.length} evidencia(s) técnica(s) adjunta(s)
                        </p>
                      </div>
                    )}

                    {/* Burbuja Principal de Texto */}
                    <div className="relative bg-white rounded-2xl p-4 shadow-sm text-xs text-carbon space-y-2 border border-black/5 ml-auto max-w-[95%]">
                      {modoEnvioMeta === "libre" ? (
                        <div className="whitespace-pre-line leading-relaxed font-sans text-xs text-carbon">
                          {textoLibre}
                        </div>
                      ) : (
                        <>
                          {/* Cabecera de Plantilla */}
                          <div className="flex items-center gap-1.5 font-bold text-[11px] text-verde-profundo border-b border-carbon/10 pb-1.5">
                            <span>🛡️</span>
                            <span>
                              {plantillaSeleccionada === "sauceda_entrega_servicio"
                                ? "Entrega de Servicio · SAUCEDA"
                                : "Entrega reporte instalación"}
                            </span>
                          </div>

                          {plantillaSeleccionada === "sauceda_entrega_servicio" ? (
                            <>
                              <p className="leading-relaxed">
                                Hola <strong className="text-carbon">{orden.clienteNombre || "Cliente"}</strong>, le confirmamos que los trabajos de su orden <strong className="text-verde-profundo font-mono">{orden.folio}</strong> han concluido exitosamente a entera satisfacción.
                              </p>

                              <div className="bg-slate-50 p-2.5 rounded-xl border border-carbon/5 text-[11px] space-y-0.5">
                                <p>📋 <strong>Proyecto:</strong> {orden.titulo}</p>
                                <p>📅 <strong>Fecha de entrega:</strong> {fechaEntrega}</p>
                              </div>

                              <p className="text-[11px] text-carbon/70">
                                Consulte su reporte digital con fotos de entrega, remisión y garantía en el siguiente enlace:
                              </p>

                              <div className="pt-2 border-t border-carbon/10">
                                <div className="w-full py-2 bg-emerald-50 border border-emerald-200 text-center rounded-xl text-xs font-bold text-emerald-800 flex items-center justify-center gap-1 shadow-2xs">
                                  <span>🔗</span>
                                  <span>Ver Reporte y Garantía</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="leading-relaxed">
                                ¡Hola <strong>{orden.clienteNombre || "Cliente"}</strong>! Gracias por elegirnos como {obtenerMarcaServicio({ tipoNegocio: orden.tipoNegocio, texto: `${orden.titulo || ""} ${orden.descripcion || ""}` }).nombreMayus}.
                              </p>
                              <p className="text-[11px] text-carbon/70">
                                Te compartimos los enlaces para descargar y consultar tus documentos oficiales de la obra:
                              </p>

                              <div className="bg-slate-50 p-2.5 rounded-xl border border-carbon/5 text-[11px] font-mono space-y-1">
                                <p className="text-emerald-800 font-bold">📄 Reporte de Obra & Evidencias:</p>
                                <p className="text-[10px] text-blue-600 underline truncate">{urlEntrega}</p>
                                {urlRemision && (
                                  <>
                                    <p className="text-emerald-800 font-bold pt-1">🧾 Remisión / Factura:</p>
                                    <p className="text-[10px] text-blue-600 underline truncate">{urlRemision}</p>
                                  </>
                                )}
                                {urlGarantia && (
                                  <>
                                    <p className="text-emerald-800 font-bold pt-1">🛡️ Póliza de Garantía Oficial:</p>
                                    <p className="text-[10px] text-blue-600 underline truncate">{urlGarantia}</p>
                                  </>
                                )}
                              </div>

                              <p className="text-[10px] text-carbon/60 italic pt-1">
                                Agradecemos mucho tu preferencia. ¡Quedamos a tus órdenes!
                              </p>
                            </>
                          )}
                        </>
                      )}

                      {/* Timestamp y palomitas dobles */}
                      <div className="flex items-center justify-end gap-1 text-[9px] text-carbon/40 pt-1">
                        <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="text-blue-500 font-bold">✓✓</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Botón de Envío Directo por Meta API */}
              <div className="flex items-center justify-between pt-2 border-t border-carbon/10">
                <div className="text-[11px] text-carbon/50">
                  {modoEnvioMeta === "libre" ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <span>✓</span> Envío libre vía Meta Cloud API ({fotosSeleccionadas.length} foto(s))
                    </span>
                  ) : plantillaSeleccionada === "entrega_documentos_remision_garantia" ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <span>✓</span> Plantilla autorizada lista para envío inmediato
                    </span>
                  ) : (
                    <span className="text-amber-800 font-medium">
                      Plantilla enviada a revisión en Meta
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleEnviarWhatsAppAPI}
                  disabled={enviando || !telefono.trim()}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 shadow-sm transition flex items-center gap-2"
                >
                  <span>
                    {enviando
                      ? "Enviando vía Meta..."
                      : modoEnvioMeta === "libre"
                      ? "🚀 Enviar Reporte, Fotos y Tarea por Meta API"
                      : "🚀 Enviar por Meta Cloud API"}
                  </span>
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
                  value={textoLibre}
                  onChange={(e) => {
                    setTextoLibre(e.target.value);
                    setEditadoManualmente(true);
                  }}
                  className="w-full rounded-xl border border-carbon/20 p-3 text-xs text-carbon font-mono focus:border-sauce outline-none"
                />
              </div>

              {/* Tarea en el Expediente */}
              <div className="rounded-2xl border border-amber-300/80 bg-amber-50/50 p-3.5 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={detonarTarea}
                    onChange={(e) => setDetonarTarea(e.target.checked)}
                    className="h-4 w-4 rounded text-sauce focus:ring-sauce accent-sauce cursor-pointer"
                  />
                  <span className="text-xs font-bold text-amber-950">
                    Detonar tarea de cotización en el Expediente al abrir WhatsApp
                  </span>
                </label>
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
                  <span>📱 Abrir en WhatsApp</span>
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

                  {notasConclusion && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-sauce/20 text-carbon/80 italic">
                      "{notasConclusion}"
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

          {/* CANAL 4: ESTADO DE PLANTILLAS EN META (BUSINESS) */}
          {canal === "meta_spec" && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 text-xs text-blue-950 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-titular font-bold text-sm text-blue-900">
                      Plantillas Registradas en Meta Business Manager (WABA: 1022532766970452)
                    </h4>
                    <p className="text-[11px] text-blue-800">
                      Monitoreo en tiempo real del estado de aprobación en Meta.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cargarEstadoInicial}
                      disabled={cargandoPlantillas}
                      className="rounded-xl bg-white border border-blue-300 text-blue-900 font-bold text-xs px-3 py-1.5 transition shadow-2xs hover:bg-blue-100"
                    >
                      {cargandoPlantillas ? "Consultando..." : "🔄 Actualizar Estado"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopiarPlantillaMeta}
                      className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 transition shadow-2xs"
                    >
                      {copiado ? "✓ ¡Copiado!" : "📋 Copiar Ficha"}
                    </button>
                  </div>
                </div>

                {/* Tabla de plantillas en Meta */}
                <div className="rounded-xl border border-blue-200 bg-white overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-blue-100/60 font-titular font-bold text-blue-950 border-b border-blue-200">
                      <tr>
                        <th className="p-2.5">Nombre de Plantilla</th>
                        <th className="p-2.5">Categoría</th>
                        <th className="p-2.5">Idioma</th>
                        <th className="p-2.5">Estado en Meta</th>
                        <th className="p-2.5">ID de Meta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-100 font-mono text-[11px]">
                      {plantillasMeta.map((p, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/50">
                          <td className="p-2.5 font-bold text-carbon">{p.name}</td>
                          <td className="p-2.5 text-carbon/70">{p.category}</td>
                          <td className="p-2.5 text-carbon/70">{p.language}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                p.status === "APPROVED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : p.status === "PENDING"
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-carbon/50">{p.id || "N/A"}</td>
                        </tr>
                      ))}
                      {plantillasMeta.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-3 text-center text-carbon/40 italic">
                            {cargandoPlantillas ? "Cargando plantillas desde Meta..." : "Sin plantillas encontradas."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 rounded-xl bg-blue-100/50 border border-blue-200 text-[11px] text-blue-900 space-y-1">
                  <p className="font-bold">Información de Aprobación:</p>
                  <p>
                    • Las plantillas <strong>UTILITY</strong> recién enviadas (<code>sauceda_entrega_servicio</code> y <code>sauceda_recibo_pago</code>) son procesadas automáticamente por Meta.
                  </p>
                  <p>
                    • Mientras tanto, la plantilla <code>entrega_documentos_remision_garantia</code> ya está <strong>APROBADA</strong> y disponible para envíos inmediatos por la Cloud API.
                  </p>
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
