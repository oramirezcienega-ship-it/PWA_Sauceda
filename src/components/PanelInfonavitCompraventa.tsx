"use client";

import { useEffect, useState, useTransition } from "react";
import {
  obtenerExpedienteInfonavitAction,
  cambiarEtapaInfonavitAction,
  cambiarEstatusOTInfonavitAction,
  validarORechazarDocumentoAction,
  guardarDatosFormularioPublicoAction,
} from "@/app/actions/infonavit-compraventa";
import type {
  ExpedienteInfonavitDetalle,
  OtInfonavitParte,
  OtInfonavitDocumento,
  OtCatalogoDocumento,
  OtInfonavitEtapa,
} from "@/lib/types";

interface PanelInfonavitCompraventaProps {
  ordenTrabajoId: string;
  folioOT: string;
  clienteNombreOT?: string;
  clienteTelefonoOT?: string;
  soloLectura?: boolean;
}

export function PanelInfonavitCompraventa({
  ordenTrabajoId,
  folioOT,
  clienteNombreOT = "Cliente",
  clienteTelefonoOT = "",
  soloLectura = false,
}: PanelInfonavitCompraventaProps) {
  const [isPending, startTransition] = useTransition();
  const [cargando, setCargando] = useState(true);
  const [expediente, setExpediente] = useState<ExpedienteInfonavitDetalle | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [exitoMsg, setExitoMsg] = useState("");

  // Pestaña activa del checklist documental
  const [tabDocs, setTabDocs] = useState<"todos" | "comprador" | "vendedor" | "inmueble">("comprador");

  // Modales
  const [docRechazoModal, setDocRechazoModal] = useState<OtInfonavitDocumento | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [modalPausaAbierto, setModalPausaAbierto] = useState(false);
  const [accionPausa, setAccionPausa] = useState<"detenida" | "cancelada">("detenida");
  const [motivoPausa, setMotivoPausa] = useState("");

  const cargarDatos = async () => {
    try {
      setCargando(true);
      setErrorMsg("");
      const res = await obtenerExpedienteInfonavitAction(ordenTrabajoId);
      if (res.ok && res.data) {
        setExpediente(res.data);
      } else {
        setErrorMsg(res.error || "No se pudo cargar el expediente INFONAVIT.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [ordenTrabajoId]);

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "https://crm.saucedamx.com";

  // Partes principales
  const comprador = expediente?.partes.find((p) => p.rol === "comprador");
  const vendedor = expediente?.partes.find((p) => p.rol === "vendedor");

  // Etapa actual
  const etapaActualId = (expediente as any)?.orden?.etapa_infonavit_id || "1_cotizacion_enviada";
  const etapaActualObj = expediente?.etapas.find((e) => e.id === etapaActualId) || expediente?.etapas[0];
  const ordenEtapaActual = etapaActualObj?.orden || 1;

  // Manejar cambio de etapa
  const handleCambiarEtapa = (nuevaEtapaId: string) => {
    if (soloLectura) return;
    setErrorMsg("");
    setExitoMsg("");

    startTransition(async () => {
      const res = await cambiarEtapaInfonavitAction(ordenTrabajoId, nuevaEtapaId);
      if (res.ok) {
        setExitoMsg("Etapa actualizada con éxito.");
        await cargarDatos();
        setTimeout(() => setExitoMsg(""), 3500);
      } else {
        setErrorMsg(res.error || "No se pudo cambiar de etapa.");
      }
    });
  };

  // Manejar validación rápida
  const handleValidarDoc = (docId: string) => {
    if (soloLectura) return;
    setErrorMsg("");
    startTransition(async () => {
      const res = await validarORechazarDocumentoAction(docId, "validar");
      if (res.ok) {
        await cargarDatos();
      } else {
        setErrorMsg(res.error || "Error al validar documento.");
      }
    });
  };

  // Confirmar rechazo con motivo
  const handleConfirmarRechazo = () => {
    if (!docRechazoModal) return;
    if (!motivoRechazo.trim()) {
      alert("Por favor escribe el motivo del rechazo para orientar al cliente.");
      return;
    }

    startTransition(async () => {
      const res = await validarORechazarDocumentoAction(
        docRechazoModal.id,
        "rechazar",
        motivoRechazo.trim()
      );
      if (res.ok) {
        setDocRechazoModal(null);
        setMotivoRechazo("");
        await cargarDatos();
      } else {
        alert("Error: " + res.error);
      }
    });
  };

  // Confirmar pausa o cancelación
  const handleConfirmarPausaCancelacion = () => {
    if (!motivoPausa.trim()) {
      alert("El motivo es obligatorio para registrar la pausa o cancelación.");
      return;
    }

    startTransition(async () => {
      const res = await cambiarEstatusOTInfonavitAction(
        ordenTrabajoId,
        accionPausa,
        motivoPausa.trim()
      );
      if (res.ok) {
        setModalPausaAbierto(false);
        setMotivoPausa("");
        await cargarDatos();
      } else {
        alert("Error: " + res.error);
      }
    });
  };

  const copiarEnlace = (token: string) => {
    const url = `${siteUrl}/expediente/${token}`;
    navigator.clipboard.writeText(url);
    alert("Enlace copiado al portapapeles:\n" + url);
  };

  const generarUrlWhatsApp = (telefono: string, nombre: string, token: string, rol: string) => {
    const cleanTel = telefono.replace(/\D/g, "");
    const telInt = cleanTel.startsWith("52") ? cleanTel : `52${cleanTel}`;
    const url = `${siteUrl}/expediente/${token}`;
    const texto = `Hola ${nombre}, te compartimos tu enlace personalizado para subir tus documentos de la compraventa INFONAVIT en SAUCEDA:\n\n🔗 ${url}\n\nPuedes tomar fotos directo desde tu celular. Si tienes dudas, estamos para apoyarte.`;
    return `https://wa.me/${telInt}?text=${encodeURIComponent(texto)}`;
  };

  // Filtrado de documentos según pestaña
  const docsFiltrados = (expediente?.catalogoDocs || []).filter((cat) => {
    if (tabDocs === "comprador") return cat.rolAplicable === "comprador" || cat.rolAplicable === "conyuge_comprador";
    if (tabDocs === "vendedor") return cat.rolAplicable === "vendedor" || cat.rolAplicable === "conyuge_vendedor";
    if (tabDocs === "inmueble") return cat.rolAplicable === "inmueble";
    return true;
  });

  // Mapa de documentos subidos por tipo_documento_id
  const docsSubidosMap = new Map<string, OtInfonavitDocumento>();
  (expediente?.documentos || []).forEach((d) => {
    docsSubidosMap.set(d.tipoDocumentoId, d);
  });

  // Alertas de vigencia (< 15 días o vencidos)
  const hoyMs = Date.now();
  const alertaVigenciaDocs = (expediente?.documentos || []).filter((d) => {
    if (!d.fechaVigencia) return false;
    const vigMs = new Date(d.fechaVigencia).getTime();
    const difDias = Math.floor((vigMs - hoyMs) / (1000 * 60 * 60 * 24));
    return difDias <= 15;
  });

  if (cargando) {
    return (
      <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-carbon/10">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-sauce border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-carbon/60 font-medium">Cargando expediente de compraventa INFONAVIT...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* MENSAJES DE ALERTA O ÉXITO */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5">
          <span className="text-base leading-none">⚠️</span>
          <div className="flex-1 font-medium">{errorMsg}</div>
          <button onClick={() => setErrorMsg("")} className="text-red-400 hover:text-red-600 font-bold">✕</button>
        </div>
      )}

      {exitoMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <span>✓</span>
          <div className="flex-1 font-medium">{exitoMsg}</div>
        </div>
      )}

      {/* ALERTA DE DOCUMENTOS CON VIGENCIA POR VENCER */}
      {alertaVigenciaDocs.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
          <span className="text-base leading-none">⏳</span>
          <div className="flex-1">
            <p className="font-semibold mb-1">Atención: Hay {alertaVigenciaDocs.length} documento(s) con vigencia próxima a expirar o vencida:</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-900/80">
              {alertaVigenciaDocs.map((d) => (
                <li key={d.id}>
                  <strong>{d.tipoDocumento?.nombre || d.tipoDocumentoId}</strong>: Vence el {d.fechaVigencia}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* HEADER: TÍTULO Y CONTROL DE ETAPAS */}
      <div className="bg-white p-5 rounded-2xl border border-carbon/10 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-carbon/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 bg-sauce/15 text-sauce font-bold rounded-lg text-xs tracking-wider">
                COMPRAVENTA INFONAVIT · $15,000 MXN
              </span>
              <span className="text-xs text-carbon/40 font-mono">Folio: {folioOT}</span>
            </div>
            <h2 className="text-lg font-bold text-carbon mt-1">Gestión Documental y Proceso de Escrituración</h2>
            <p className="text-xs text-carbon/60">
              Acompañamiento integral · Control de 10 etapas · Esquema 50% anticipo / 50% liquidación
            </p>
          </div>

          {/* Botones de acción rápida */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAccionPausa("detenida");
                setModalPausaAbierto(true);
              }}
              className="px-3 py-1.5 rounded-xl border border-amber-300 text-amber-700 bg-amber-50/60 hover:bg-amber-100/80 text-xs font-semibold transition"
            >
              ⏸ Pausar OT
            </button>
            <button
              onClick={() => {
                setAccionPausa("cancelada");
                setModalPausaAbierto(true);
              }}
              className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 bg-red-50/60 hover:bg-red-100/80 text-xs font-semibold transition"
            >
              ✕ Cancelar OT
            </button>
          </div>
        </div>

        {/* LÍNEA DE TIEMPO INTERACTIVA DE LAS 10 ETAPAS */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-carbon/70 uppercase tracking-wider">
              Línea de Proceso: Etapa {ordenEtapaActual} de 10 —{" "}
              <span className="text-verde-profundo font-extrabold">{etapaActualObj?.nombre}</span>
            </span>
            <span className="text-[11px] text-carbon/50">Haz clic en una etapa para seleccionarla</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2">
            {(expediente?.etapas || []).map((et) => {
              const esActual = et.id === etapaActualId;
              const esCompletada = et.orden < ordenEtapaActual;
              const tieneBloqueo = et.orden === 4;

              return (
                <button
                  key={et.id}
                  disabled={isPending || soloLectura}
                  onClick={() => handleCambiarEtapa(et.id)}
                  title={et.descripcion || et.nombre}
                  className={`flex flex-col items-center text-center p-2.5 rounded-xl border transition-all relative ${
                    esActual
                      ? "bg-verde-profundo text-white border-verde-profundo shadow-md scale-[1.02]"
                      : esCompletada
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-300"
                      : "bg-carbon/5 text-carbon/60 border-carbon/10 hover:border-sauce/50"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mb-1 ${
                      esActual
                        ? "bg-dorado text-carbon"
                        : esCompletada
                        ? "bg-emerald-600 text-white"
                        : "bg-carbon/15 text-carbon/70"
                    }`}
                  >
                    {esCompletada ? "✓" : et.orden}
                  </span>
                  <span className="text-[10px] font-semibold leading-tight line-clamp-2">
                    {et.nombre}
                  </span>
                  {tieneBloqueo && (
                    <span
                      title="Candado: se deben validar todos los documentos antes de pasar a la etapa 5"
                      className="absolute top-1 right-1 text-[9px]"
                    >
                      🔒
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* TARJETAS DE HITOS DE PAGO 50/50 */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-carbon/10">
          <div className="p-3.5 bg-crema-marfil/60 rounded-xl border border-dorado/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-sauce uppercase tracking-wider">Anticipo (50%)</span>
              <p className="text-base font-extrabold text-verde-profundo">$7,500.00 MXN</p>
              <p className="text-[11px] text-carbon/60">Al aceptar propuesta e iniciar expediente</p>
            </div>
            <div className="text-right">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                ✓ Anticipo Activo
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-crema-marfil/60 rounded-xl border border-dorado/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-sauce uppercase tracking-wider">Liquidación (50%)</span>
              <p className="text-base font-extrabold text-verde-profundo">$7,500.00 MXN</p>
              <p className="text-[11px] text-carbon/60">A la firma de escritura en Notaría</p>
            </div>
            <div className="text-right">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-carbon/10 text-carbon/60">
                Pendiente a la firma
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: TARJETAS DE PARTES (COMPRADOR / VENDEDOR) E INMUEBLE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* COMPRADOR */}
        <div className="bg-white p-4 rounded-2xl border border-carbon/10 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-carbon/10 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sauce" />
                <h3 className="text-sm font-bold text-carbon">Parte Compradora</h3>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  comprador?.formularioCompletado
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {comprador?.formularioCompletado ? "✓ Formulario Completo" : "Pendiente de Llenar"}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <p>
                <strong className="text-carbon/60">Nombre:</strong>{" "}
                <span className="font-semibold text-carbon">{comprador?.nombre || clienteNombreOT}</span>
              </p>
              <p>
                <strong className="text-carbon/60">Teléfono:</strong>{" "}
                <a
                  href={`tel:${comprador?.telefono || clienteTelefonoOT}`}
                  className="font-semibold text-sauce hover:underline"
                >
                  {comprador?.telefono || clienteTelefonoOT || "No registrado"}
                </a>
              </p>
              <p>
                <strong className="text-carbon/60">CURP:</strong>{" "}
                <span className="font-mono text-carbon">{comprador?.curp || "Por capturar"}</span>
              </p>
              <p>
                <strong className="text-carbon/60">RFC:</strong>{" "}
                <span className="font-mono text-carbon">{comprador?.rfc || "Por capturar"}</span>
              </p>
              <p>
                <strong className="text-carbon/60">Estado Civil:</strong>{" "}
                <span className="capitalize">{comprador?.estadoCivil || "No especificado"}</span>
              </p>
            </div>
          </div>

          {comprador?.tokenFormulario && (
            <div className="mt-4 pt-3 border-t border-carbon/10 flex items-center gap-2">
              <button
                onClick={() => copiarEnlace(comprador.tokenFormulario)}
                className="flex-1 py-1.5 px-2 bg-carbon/5 hover:bg-carbon/10 text-carbon rounded-xl text-xs font-semibold text-center transition"
              >
                📋 Copiar Link
              </button>
              <a
                href={generarUrlWhatsApp(
                  comprador.telefono || clienteTelefonoOT,
                  comprador.nombre,
                  comprador.tokenFormulario,
                  "comprador"
                )}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold text-center transition"
              >
                💬 WhatsApp
              </a>
            </div>
          )}
        </div>

        {/* VENDEDOR */}
        <div className="bg-white p-4 rounded-2xl border border-carbon/10 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-carbon/10 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-dorado" />
                <h3 className="text-sm font-bold text-carbon">Parte Vendedora (Propietario)</h3>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  vendedor?.formularioCompletado
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {vendedor?.formularioCompletado ? "✓ Formulario Completo" : "Pendiente de Llenar"}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <p>
                <strong className="text-carbon/60">Nombre:</strong>{" "}
                <span className="font-semibold text-carbon">{vendedor?.nombre || "Por registrar"}</span>
              </p>
              <p>
                <strong className="text-carbon/60">Teléfono:</strong>{" "}
                <a
                  href={`tel:${vendedor?.telefono || ""}`}
                  className="font-semibold text-sauce hover:underline"
                >
                  {vendedor?.telefono || "No registrado"}
                </a>
              </p>
              <p>
                <strong className="text-carbon/60">CURP:</strong>{" "}
                <span className="font-mono text-carbon">{vendedor?.curp || "Por capturar"}</span>
              </p>
              <p>
                <strong className="text-carbon/60">RFC:</strong>{" "}
                <span className="font-mono text-carbon">{vendedor?.rfc || "Por capturar"}</span>
              </p>
              <p>
                <strong className="text-carbon/60">Estado Civil:</strong>{" "}
                <span className="capitalize">{vendedor?.estadoCivil || "No especificado"}</span>
              </p>
            </div>
          </div>

          {vendedor?.tokenFormulario && (
            <div className="mt-4 pt-3 border-t border-carbon/10 flex items-center gap-2">
              <button
                onClick={() => copiarEnlace(vendedor.tokenFormulario)}
                className="flex-1 py-1.5 px-2 bg-carbon/5 hover:bg-carbon/10 text-carbon rounded-xl text-xs font-semibold text-center transition"
              >
                📋 Copiar Link
              </button>
              <a
                href={generarUrlWhatsApp(
                  vendedor.telefono,
                  vendedor.nombre,
                  vendedor.tokenFormulario,
                  "vendedor"
                )}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold text-center transition"
              >
                💬 WhatsApp
              </a>
            </div>
          )}
        </div>

        {/* DATOS DEL INMUEBLE */}
        <div className="bg-white p-4 rounded-2xl border border-carbon/10 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-carbon/10 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-verde-profundo" />
                <h3 className="text-sm font-bold text-carbon">Datos del Inmueble</h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sauce/15 text-sauce">
                {expediente?.inmueble?.ciudad || "León, Gto."}
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <p>
                <strong className="text-carbon/60">Ubicación:</strong>{" "}
                <span>{expediente?.inmueble?.direccion || "Por capturar en formulario"}</span>
              </p>
              <p>
                <strong className="text-carbon/60">Fraccionamiento:</strong>{" "}
                <span>{expediente?.inmueble?.fraccionamiento || "Por registrar"}</span>
              </p>
              <p>
                <strong className="text-carbon/60">Cuenta Predial:</strong>{" "}
                <span className="font-mono">{expediente?.inmueble?.cuentaPredial || "No capturada"}</span>
              </p>
              <p>
                <strong className="text-carbon/60">¿Tiene Hipoteca / Deuda?:</strong>{" "}
                <span className={expediente?.inmueble?.tieneCreditoVigente ? "text-amber-700 font-bold" : "text-emerald-700 font-medium"}>
                  {expediente?.inmueble?.tieneCreditoVigente
                    ? `Sí (${expediente?.inmueble?.institucionAcreedora || "Acreedor"} - Aprox. $${expediente?.inmueble?.saldoCreditoAprox || 0})`
                    : "No (Libre de gravamen previo)"}
                </span>
              </p>
              <p>
                <strong className="text-carbon/60">¿Régimen Condominio?:</strong>{" "}
                <span>{expediente?.inmueble?.esRegimenCondominio ? "Sí (Requiere constancia no adeudo cuotas)" : "No"}</span>
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-carbon/10 text-right">
            <span className="text-[11px] text-carbon/40 italic">Información sincronizada con el vendedor</span>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: CHECKLIST DOCUMENTAL CON BOTONES VALIDAR / RECHAZAR */}
      <div className="bg-white rounded-2xl border border-carbon/10 shadow-sm overflow-hidden">
        {/* Encabezado de Pestañas */}
        <div className="p-4 border-b border-carbon/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-crema-marfil/30">
          <div>
            <h3 className="text-base font-bold text-carbon">Checklist y Cotejo Documental</h3>
            <p className="text-xs text-carbon/60">
              Revisa cada archivo recibido, verifica su legibilidad y valida o rechaza con motivo.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-carbon/5 p-1 rounded-xl">
            <button
              onClick={() => setTabDocs("comprador")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                tabDocs === "comprador" ? "bg-white text-sauce shadow-sm" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              Comprador
            </button>
            <button
              onClick={() => setTabDocs("vendedor")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                tabDocs === "vendedor" ? "bg-white text-sauce shadow-sm" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              Vendedor
            </button>
            <button
              onClick={() => setTabDocs("inmueble")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                tabDocs === "inmueble" ? "bg-white text-sauce shadow-sm" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              Inmueble
            </button>
            <button
              onClick={() => setTabDocs("todos")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                tabDocs === "todos" ? "bg-white text-sauce shadow-sm" : "text-carbon/60 hover:text-carbon"
              }`}
            >
              Todos ({expediente?.catalogoDocs.length})
            </button>
          </div>
        </div>

        {/* LISTADO DE DOCUMENTOS */}
        <div className="divide-y divide-carbon/5">
          {docsFiltrados.map((cat) => {
            const subido = docsSubidosMap.get(cat.id);
            const estatus = subido?.estatus || "pendiente";

            return (
              <div key={cat.id} className="p-4 hover:bg-carbon/[0.015] transition flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-carbon">{cat.nombre}</span>
                    {cat.obligatorio ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                        Obligatorio
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-carbon/5 text-carbon/60">
                        Condicional
                      </span>
                    )}

                    {cat.tieneVigencia && (
                      <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Vigencia ({cat.diasVigenciaDefault || 90} días)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-carbon/50 mt-0.5">{cat.descripcion}</p>

                  {/* Estado y detalles de archivo subido */}
                  {subido && (
                    <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                      <span className="text-carbon/60">
                        Archivo: <span className="font-mono text-carbon">{subido.archivoNombreOriginal || "documento"}</span>
                      </span>
                      {subido.fechaVigencia && (
                        <span className="text-amber-800 font-medium">
                          Vigente hasta: {subido.fechaVigencia}
                        </span>
                      )}
                      {subido.motivoRechazo && (
                        <span className="text-red-600 font-medium">
                          Motivo rechazo: {subido.motivoRechazo}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Estatus Pill y Botones de Validación */}
                <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                  {/* Badge de Estatus */}
                  {estatus === "validado" && (
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1">
                      <span>✓</span> Validado
                    </span>
                  )}
                  {estatus === "recibido" && (
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1">
                      <span>⏱</span> Por Validar
                    </span>
                  )}
                  {estatus === "rechazado" && (
                    <span className="px-2.5 py-1 bg-red-100 text-red-800 border border-red-200 rounded-lg text-xs font-bold flex items-center gap-1">
                      <span>✕</span> Rechazado
                    </span>
                  )}
                  {estatus === "pendiente" && (
                    <span className="px-2.5 py-1 bg-carbon/10 text-carbon/50 rounded-lg text-xs font-medium">
                      Sin Subir
                    </span>
                  )}

                  {/* Botón Ver Documento si existe URL */}
                  {subido?.urlFirmada && (
                    <a
                      href={subido.urlFirmada}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 bg-carbon/5 hover:bg-carbon/10 text-carbon font-semibold text-xs rounded-lg transition"
                    >
                      👁 Ver
                    </a>
                  )}

                  {/* Acciones de Validación para el asesor */}
                  {!soloLectura && subido && (
                    <>
                      {estatus !== "validado" && (
                        <button
                          disabled={isPending}
                          onClick={() => handleValidarDoc(subido.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition"
                        >
                          Validar
                        </button>
                      )}

                      {estatus !== "rechazado" && (
                        <button
                          disabled={isPending}
                          onClick={() => {
                            setDocRechazoModal(subido);
                            setMotivoRechazo("");
                          }}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold text-xs rounded-lg transition"
                        >
                          Rechazar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL DE RECHAZO DE DOCUMENTO */}
      {docRechazoModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-carbon/10">
            <h3 className="text-base font-bold text-carbon">Rechazar Documento</h3>
            <p className="text-xs text-carbon/60 mt-1">
              Documento: <strong>{docRechazoModal.tipoDocumento?.nombre || docRechazoModal.tipoDocumentoId}</strong>
            </p>
            <p className="text-xs text-carbon/50 mt-0.5">
              Escribe el motivo claro. Este texto se enviará automáticamente al cliente para que vuelva a tomar la foto o corregir el documento.
            </p>

            <textarea
              rows={3}
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              placeholder="Ej. La imagen está borrosa en la parte del RFC, favor de tomarla con mejor iluminación y completa."
              className="w-full mt-3 p-3 text-xs border border-carbon/20 rounded-xl focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
            />

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setDocRechazoModal(null)}
                className="px-3 py-1.5 text-xs text-carbon/70 hover:text-carbon font-semibold"
              >
                Cancelar
              </button>
              <button
                disabled={isPending}
                onClick={handleConfirmarRechazo}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PAUSA / CANCELACIÓN DE ORDEN */}
      {modalPausaAbierto && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-carbon/10">
            <h3 className="text-base font-bold text-carbon">
              {accionPausa === "detenida" ? "Pausar Orden de Trabajo" : "Cancelar Orden de Trabajo"}
            </h3>
            <p className="text-xs text-carbon/60 mt-1">
              Por normativa del proceso, es estrictamente obligatorio registrar el motivo por el cual la orden no puede continuar.
            </p>

            <textarea
              rows={3}
              value={motivoPausa}
              onChange={(e) => setMotivoPausa(e.target.value)}
              placeholder="Ej. El cliente no cuenta con los puntos mínimos de INFONAVIT / Gravamen no cancelable / Decisión del vendedor."
              className="w-full mt-3 p-3 text-xs border border-carbon/20 rounded-xl focus:border-sauce focus:ring-1 focus:ring-sauce outline-none"
            />

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setModalPausaAbierto(false)}
                className="px-3 py-1.5 text-xs text-carbon/70 hover:text-carbon font-semibold"
              >
                Volver
              </button>
              <button
                disabled={isPending}
                onClick={handleConfirmarPausaCancelacion}
                className={`px-4 py-1.5 text-white text-xs font-bold rounded-xl transition ${
                  accionPausa === "detenida" ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                Confirmar {accionPausa === "detenida" ? "Pausa" : "Cancelación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
