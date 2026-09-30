"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import {
  obtenerFormularioPublicoPorTokenAction,
  guardarDatosFormularioPublicoAction,
  subirDocumentoPublicoAction,
} from "@/app/actions/infonavit-compraventa";
import type {
  OtInfonavitParte,
  OtInfonavitInmueble,
  OtCatalogoDocumento,
  OtInfonavitDocumento,
} from "@/lib/types";

interface FormularioClienteInfonavitProps {
  token: string;
}

export function FormularioClienteInfonavit({ token }: FormularioClienteInfonavitProps) {
  const [isPending, startTransition] = useTransition();
  const [cargando, setCargando] = useState(true);
  const [errorGeneral, setErrorGeneral] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");

  // Datos cargados por el token
  const [parte, setParte] = useState<OtInfonavitParte | null>(null);
  const [inmueble, setInmueble] = useState<OtInfonavitInmueble | null>(null);
  const [orden, setOrden] = useState<{
    id: string;
    folio: string;
    titulo: string;
    estatus: string;
    etapaNombre: string;
    etapaOrden: number;
    motivoDetencion?: string | null;
  } | null>(null);
  const [catalogoDocs, setCatalogoDocs] = useState<OtCatalogoDocumento[]>([]);
  const [documentosSubidos, setDocumentosSubidos] = useState<OtInfonavitDocumento[]>([]);

  // Estados de formulario editable
  const [curp, setCurp] = useState("");
  const [rfc, setRfc] = useState("");
  const [estadoCivil, setEstadoCivil] = useState<"soltero" | "casado" | "union_libre" | "divorciado" | "viudo">("soltero");
  const [regimenMatrimonial, setRegimenMatrimonial] = useState<"separacion_bienes" | "sociedad_conyugal" | "no_aplica">("no_aplica");
  const [avisoPrivacidad, setAvisoPrivacidad] = useState(false);

  // Estados de inmueble (solo para vendedor)
  const [cuentaPredial, setCuentaPredial] = useState("");
  const [tieneCreditoVigente, setTieneCreditoVigente] = useState(false);
  const [institucionAcreedora, setInstitucionAcreedora] = useState("");
  const [saldoCreditoAprox, setSaldoCreditoAprox] = useState<number>(0);
  const [esRegimenCondominio, setEsRegimenCondominio] = useState(false);
  const [estaHabitada, setEstaHabitada] = useState(false);

  // Estado de subida de archivo individual
  const [subiendoDocId, setSubiendoDocId] = useState<string | null>(null);

  const cargarFormulario = async () => {
    try {
      setCargando(true);
      setErrorGeneral("");
      const res = await obtenerFormularioPublicoPorTokenAction(token);
      if (res.ok && res.parte) {
        setParte(res.parte);
        setInmueble(res.inmueble || null);
        setOrden(res.orden || null);
        setCatalogoDocs(res.catalogoDocs || []);
        setDocumentosSubidos(res.documentosSubidos || []);

        // Precargar valores
        setCurp(res.parte.curp || "");
        setRfc(res.parte.rfc || "");
        setEstadoCivil(res.parte.estadoCivil || "soltero");
        setRegimenMatrimonial(res.parte.regimenMatrimonial || "no_aplica");
        setAvisoPrivacidad(res.parte.avisoPrivacidadAceptado);

        if (res.inmueble) {
          setCuentaPredial(res.inmueble.cuentaPredial || "");
          setTieneCreditoVigente(res.inmueble.tieneCreditoVigente);
          setInstitucionAcreedora(res.inmueble.institucionAcreedora || "");
          setSaldoCreditoAprox(res.inmueble.saldoCreditoAprox || 0);
          setEsRegimenCondominio(res.inmueble.esRegimenCondominio);
          setEstaHabitada(res.inmueble.estaHabitada);
        }
      } else {
        setErrorGeneral(res.error || "No pudimos cargar tu expediente.");
      }
    } catch (err: any) {
      setErrorGeneral(err.message || "Error al conectar con SAUCEDA.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarFormulario();
  }, [token]);

  // Manejar guardado de datos generales
  const handleGuardarDatos = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!avisoPrivacidad) {
      alert("Debes aceptar el Aviso de Privacidad para continuar con el trámite.");
      return;
    }

    startTransition(async () => {
      setMensajeExito("");
      const res = await guardarDatosFormularioPublicoAction(
        token,
        {
          curp,
          rfc,
          estadoCivil,
          regimenMatrimonial: estadoCivil === "casado" ? regimenMatrimonial : "no_aplica",
          avisoPrivacidadAceptado: avisoPrivacidad,
        },
        parte?.rol === "vendedor"
          ? {
              cuentaPredial,
              tieneCreditoVigente,
              institucionAcreedora,
              saldoCreditoAprox,
              esRegimenCondominio,
              estaHabitada,
            }
          : undefined
      );

      if (res.ok) {
        setMensajeExito("Tus datos generales se guardaron correctamente.");
        setTimeout(() => setMensajeExito(""), 4000);
      } else {
        alert("Error al guardar: " + res.error);
      }
    });
  };

  // Manejar subida de archivo por cada tarjeta
  const handleSubirArchivo = async (tipoDocumentoId: string, archivo: File) => {
    try {
      setSubiendoDocId(tipoDocumentoId);
      const formData = new FormData();
      formData.append("archivo", archivo);

      const res = await subirDocumentoPublicoAction(token, tipoDocumentoId, formData);
      if (res.ok && res.documento) {
        // Actualizar lista local de documentos
        setDocumentosSubidos((prev) => {
          const sinEste = prev.filter((d) => d.tipoDocumentoId !== tipoDocumentoId);
          return [...sinEste, res.documento!];
        });
        setMensajeExito("¡Archivo subido exitosamente!");
        setTimeout(() => setMensajeExito(""), 3500);
      } else {
        alert("Error al subir archivo: " + res.error);
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setSubiendoDocId(null);
    }
  };

  // Filtrar documentos que aplican según las respuestas condicionales del cliente
  const docsAplicables = catalogoDocs.filter((cat) => {
    if (cat.condicionRegla === "si_casado" && estadoCivil !== "casado") return false;
    if (cat.condicionRegla === "si_mancomunados" && (estadoCivil !== "casado" || regimenMatrimonial !== "sociedad_conyugal")) return false;
    if (cat.condicionRegla === "si_credito_vigente" && !tieneCreditoVigente) return false;
    if (cat.condicionRegla === "si_condominio" && !esRegimenCondominio) return false;
    return true;
  });

  // Mapeo de subidos
  const subidosMap = new Map<string, OtInfonavitDocumento>();
  documentosSubidos.forEach((d) => subidosMap.set(d.tipoDocumentoId, d));

  // Progreso
  const obligatoriosAplicables = docsAplicables.filter((d) => d.obligatorio);
  const obligatoriosListos = obligatoriosAplicables.filter((d) => {
    const sub = subidosMap.get(d.id);
    return sub && (sub.estatus === "validado" || sub.estatus === "recibido");
  });
  const porcentaje = obligatoriosAplicables.length > 0
    ? Math.round((obligatoriosListos.length / obligatoriosAplicables.length) * 100)
    : 0;

  if (cargando) {
    return (
      <main className="min-h-screen bg-[#F5F1E8]/50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-[#2D4A2B]/10 shadow-lg text-center max-w-sm w-full">
          <div className="w-10 h-10 border-4 border-[#5C7A52] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="font-bold text-[#1A1A1A] text-sm">Cargando tu expediente SAUCEDA...</h2>
          <p className="text-xs text-[#1A1A1A]/60 mt-1">Conectando de forma segura</p>
        </div>
      </main>
    );
  }

  if (errorGeneral) {
    return (
      <main className="min-h-screen bg-[#F5F1E8]/50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-red-200 shadow-xl text-center max-w-md w-full">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-2xl mx-auto mb-4">
            🔒
          </div>
          <h2 className="font-bold text-lg text-[#1A1A1A]">Enlace no disponible</h2>
          <p className="text-xs text-[#1A1A1A]/70 mt-2 leading-relaxed">{errorGeneral}</p>
          <a
            href="https://wa.me/524774654700"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-[#5C7A52] hover:bg-[#2D4A2B] text-white font-bold text-xs rounded-xl shadow-md transition"
          >
            💬 Contactar a SAUCEDA por WhatsApp
          </a>
        </div>
      </main>
    );
  }

  const esComprador = parte?.rol === "comprador";

  return (
    <main className="min-h-screen bg-[#F5F1E8]/40 pb-16 font-sans">
      {/* HEADER SUPERIOR BRANDED */}
      <header className="bg-[#2D4A2B] text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#C9A961] flex items-center justify-center font-extrabold text-[#1A1A1A] text-sm shadow-inner">
              S
            </div>
            <div>
              <p className="text-xs font-bold tracking-wider leading-none">SAUCEDA</p>
              <p className="text-[10px] text-[#C9A961] font-semibold leading-tight">BIENES RAÍCES</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] bg-white/10 px-2.5 py-1 rounded-full text-white/90 font-mono">
              Folio: {orden?.folio || "OT"}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {/* BANNER DE BIENVENIDA */}
        <div className="bg-white p-5 rounded-3xl border border-[#2D4A2B]/10 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-[#5C7A52]/10 rounded-full blur-2xl -mr-6 -mt-6" />

          <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[#5C7A52]/15 text-[#2D4A2B] inline-block mb-2">
            {esComprador ? "👤 Parte Compradora" : "🏠 Parte Vendedora (Propietario)"}
          </span>

          <h1 className="text-xl font-bold text-[#1A1A1A]">
            ¡Hola, {parte?.nombre.split(" ")[0]}!
          </h1>
          <p className="text-xs text-[#1A1A1A]/70 mt-1 leading-relaxed">
            Te damos la bienvenida a tu portal de integración documental para tu compraventa con crédito INFONAVIT. Sube tus documentos con fotos claras desde tu celular.
          </p>

          {/* ESTATUS DEL PROCESO */}
          <div className="mt-4 p-3 bg-[#F5F1E8]/70 rounded-2xl border border-[#C9A961]/30 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase font-bold text-[#5C7A52] tracking-wider">Etapa Actual de tu Trámite</p>
              <p className="text-xs font-extrabold text-[#2D4A2B]">{orden?.etapaNombre}</p>
            </div>
            <span className="text-xs font-bold text-[#C9A961] bg-[#2D4A2B] px-2.5 py-1 rounded-xl">
              Paso {orden?.etapaOrden} de 10
            </span>
          </div>

          {/* BARRA DE PROGRESO DE DOCUMENTOS */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5 font-semibold">
              <span className="text-[#1A1A1A]/80">Progreso de Documentos Obligatorios</span>
              <span className="text-[#2D4A2B] font-extrabold font-mono">{porcentaje}%</span>
            </div>
            <div className="w-full bg-[#1A1A1A]/10 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#5C7A52] to-[#2D4A2B] h-full rounded-full transition-all duration-500"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
            <p className="text-[11px] text-[#1A1A1A]/50 mt-1">
              {obligatoriosListos.length} de {obligatoriosAplicables.length} documentos obligatorios subidos
            </p>
          </div>
        </div>

        {mensajeExito && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <span>✓</span> {mensajeExito}
          </div>
        )}

        {/* SECCIÓN 1: DATOS GENERALES */}
        <form onSubmit={handleGuardarDatos} className="bg-white p-5 rounded-3xl border border-[#2D4A2B]/10 shadow-sm space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#1A1A1A]/10">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5C7A52]" />
            <h2 className="text-sm font-bold text-[#1A1A1A]">Paso 1: Confirma tus Datos Generales</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-[#1A1A1A]/70 mb-1">CURP (18 caracteres) *</label>
              <input
                type="text"
                maxLength={18}
                required
                value={curp}
                onChange={(e) => setCurp(e.target.value.toUpperCase())}
                placeholder="Ej. ABCD900101HGT..."
                className="w-full p-2.5 rounded-xl border border-[#1A1A1A]/20 font-mono uppercase focus:border-[#5C7A52] focus:ring-1 focus:ring-[#5C7A52] outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-[#1A1A1A]/70 mb-1">RFC con Homoclave (13 caracteres) *</label>
              <input
                type="text"
                maxLength={13}
                required
                value={rfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
                placeholder="Ej. ABCD900101XXX"
                className="w-full p-2.5 rounded-xl border border-[#1A1A1A]/20 font-mono uppercase focus:border-[#5C7A52] focus:ring-1 focus:ring-[#5C7A52] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-bold text-[#1A1A1A]/70 mb-1">Estado Civil *</label>
              <select
                value={estadoCivil}
                onChange={(e: any) => setEstadoCivil(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#1A1A1A]/20 bg-white focus:border-[#5C7A52] focus:ring-1 focus:ring-[#5C7A52] outline-none"
              >
                <option value="soltero">Soltero(a)</option>
                <option value="casado">Casado(a)</option>
                <option value="union_libre">Unión Libre</option>
                <option value="divorciado">Divorciado(a)</option>
                <option value="viudo">Viudo(a)</option>
              </select>
            </div>

            {estadoCivil === "casado" && (
              <div>
                <label className="block font-bold text-[#1A1A1A]/70 mb-1">Régimen Matrimonial *</label>
                <select
                  value={regimenMatrimonial}
                  onChange={(e: any) => setRegimenMatrimonial(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#1A1A1A]/20 bg-white focus:border-[#5C7A52] focus:ring-1 focus:ring-[#5C7A52] outline-none font-medium"
                >
                  <option value="sociedad_conyugal">Bienes Mancomunados (Sociedad Conyugal)</option>
                  <option value="separacion_bienes">Separación de Bienes</option>
                </select>
              </div>
            )}
          </div>

          {estadoCivil === "casado" && regimenMatrimonial === "sociedad_conyugal" && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
              ℹ️ Al estar casado por bienes mancomunados, el sistema te solicitará en la sección de documentos el <strong>Acta de Matrimonio</strong> y la <strong>INE de tu cónyuge</strong>.
            </div>
          )}

          {/* PREGUNTAS DEL INMUEBLE SI ES VENDEDOR */}
          {!esComprador && (
            <div className="pt-3 border-t border-[#1A1A1A]/10 space-y-3">
              <h3 className="text-xs font-bold text-[#2D4A2B] uppercase tracking-wider">
                Datos de la Propiedad en Venta
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-[#1A1A1A]/70 mb-1">Cuenta Predial</label>
                  <input
                    type="text"
                    value={cuentaPredial}
                    onChange={(e) => setCuentaPredial(e.target.value)}
                    placeholder="Ej. 01-A-123456-001"
                    className="w-full p-2.5 rounded-xl border border-[#1A1A1A]/20 font-mono outline-none"
                  />
                </div>

                <div className="flex flex-col justify-center">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-[#1A1A1A]">
                    <input
                      type="checkbox"
                      checked={tieneCreditoVigente}
                      onChange={(e) => setTieneCreditoVigente(e.target.checked)}
                      className="w-4 h-4 rounded text-[#5C7A52] focus:ring-0"
                    />
                    <span>¿La casa tiene crédito/hipoteca activa?</span>
                  </label>
                </div>
              </div>

              {tieneCreditoVigente && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-3 bg-[#F5F1E8]/70 rounded-xl">
                  <div>
                    <label className="block font-bold text-[#1A1A1A]/70 mb-1">Institución Acreedora</label>
                    <input
                      type="text"
                      value={institucionAcreedora}
                      onChange={(e) => setInstitucionAcreedora(e.target.value)}
                      placeholder="Ej. INFONAVIT / Banco BBVA"
                      className="w-full p-2 rounded-lg border border-[#1A1A1A]/20 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#1A1A1A]/70 mb-1">Saldo Aprox. de Deuda ($ MXN)</label>
                    <input
                      type="number"
                      value={saldoCreditoAprox || ""}
                      onChange={(e) => setSaldoCreditoAprox(Number(e.target.value))}
                      placeholder="Ej. 250000"
                      className="w-full p-2 rounded-lg border border-[#1A1A1A]/20 bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={esRegimenCondominio}
                    onChange={(e) => setEsRegimenCondominio(e.target.checked)}
                    className="w-4 h-4 rounded text-[#5C7A52]"
                  />
                  <span>¿Es privada/condominio con cuotas de mantenimiento?</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={estaHabitada}
                    onChange={(e) => setEstaHabitada(e.target.checked)}
                    className="w-4 h-4 rounded text-[#5C7A52]"
                  />
                  <span>¿El inmueble está habitado actualmente?</span>
                </label>
              </div>
            </div>
          )}

          {/* CASILLA DE AVISO DE PRIVACIDAD */}
          <div className="pt-3 border-t border-[#1A1A1A]/10">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs leading-relaxed text-[#1A1A1A]/80">
              <input
                type="checkbox"
                required
                checked={avisoPrivacidad}
                onChange={(e) => setAvisoPrivacidad(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-[#5C7A52] focus:ring-0 shrink-0"
              />
              <span>
                He leído y acepto el <strong>Aviso de Privacidad de SAUCEDA Bienes Raíces</strong>. Autorizo el uso de mis datos y documentos exclusivamente para la gestión y trámite de la compraventa ante el INFONAVIT y la Notaría Pública.
              </span>
            </label>
          </div>

          <div className="text-right pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2.5 bg-[#2D4A2B] hover:bg-[#1A1A1A] text-white text-xs font-bold rounded-xl shadow-md transition disabled:opacity-50"
            >
              Guardar Datos Generales
            </button>
          </div>
        </form>

        {/* SECCIÓN 2: CHECKLIST DE DOCUMENTOS CON CÁMARA */}
        <div className="bg-white p-5 rounded-3xl border border-[#2D4A2B]/10 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#1A1A1A]/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C9A961]" />
              <h2 className="text-sm font-bold text-[#1A1A1A]">Paso 2: Sube tus Documentos</h2>
            </div>
            <span className="text-[11px] text-[#1A1A1A]/50">Formatos: JPG, PNG o PDF</span>
          </div>

          <p className="text-xs text-[#1A1A1A]/60">
            Toma fotos claras, con buena iluminación y donde se aprecien las cuatro esquinas del documento. Puedes subir o reemplazar cada archivo cuando lo desees.
          </p>

          <div className="space-y-3 pt-1">
            {docsAplicables.map((cat) => {
              const subido = subidosMap.get(cat.id);
              const estatus = subido?.estatus || "pendiente";
              const estaSubiendo = subiendoDocId === cat.id;

              return (
                <div
                  key={cat.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    estatus === "validado"
                      ? "bg-emerald-50/50 border-emerald-200"
                      : estatus === "rechazado"
                      ? "bg-red-50/50 border-red-300 ring-1 ring-red-300"
                      : estatus === "recibido"
                      ? "bg-blue-50/40 border-blue-200"
                      : "bg-[#F5F1E8]/30 border-[#1A1A1A]/10 hover:border-[#5C7A52]/40"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#1A1A1A]">{cat.nombre}</span>
                        {cat.obligatorio && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                            Requerido
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#1A1A1A]/60 mt-0.5">{cat.descripcion}</p>

                      {/* ALERTA DE RECHAZO CON MOTIVO */}
                      {estatus === "rechazado" && subido?.motivoRechazo && (
                        <div className="mt-2 p-2.5 bg-red-100/70 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
                          <span className="text-base leading-none">⚠️</span>
                          <div>
                            <strong className="block font-bold">Favor de volver a subir este documento:</strong>
                            <p className="mt-0.5">{subido.motivoRechazo}</p>
                          </div>
                        </div>
                      )}

                      {/* MENSAJE DE VALIDADO */}
                      {estatus === "validado" && (
                        <p className="mt-1 text-[11px] text-emerald-800 font-bold flex items-center gap-1">
                          <span>✓</span> Documento revisado y aprobado por tu asesor
                        </p>
                      )}

                      {estatus === "recibido" && (
                        <p className="mt-1 text-[11px] text-blue-700 font-medium">
                          ⏱ Archivo en revisión técnica por el equipo de SAUCEDA
                        </p>
                      )}
                    </div>

                    {/* BOTÓN DE SUBIDA DIRECTA / CÁMARA */}
                    <div className="w-full sm:w-auto flex items-center justify-end gap-2">
                      {subido?.urlFirmada && (
                        <a
                          href={subido.urlFirmada}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-white border border-[#1A1A1A]/15 text-[#1A1A1A] rounded-xl text-xs font-semibold hover:bg-[#1A1A1A]/5 transition"
                        >
                          👁 Ver
                        </a>
                      )}

                      <label
                        className={`cursor-pointer px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm ${
                          estaSubiendo
                            ? "bg-[#1A1A1A]/20 text-[#1A1A1A]/60 cursor-not-allowed"
                            : estatus === "rechazado"
                            ? "bg-red-600 hover:bg-red-700 text-white"
                            : estatus === "validado"
                            ? "bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                            : subido
                            ? "bg-white border border-[#1A1A1A]/20 text-[#1A1A1A] hover:bg-[#1A1A1A]/5"
                            : "bg-[#5C7A52] hover:bg-[#2D4A2B] text-white"
                        }`}
                      >
                        {estaSubiendo ? (
                          <span>Subiendo...</span>
                        ) : estatus === "rechazado" ? (
                          <span>📷 Corregir Foto</span>
                        ) : subido ? (
                          <span>📷 Reemplazar</span>
                        ) : (
                          <span>📷 Tomar Foto / Subir</span>
                        )}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          disabled={estaSubiendo}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleSubirArchivo(cat.id, file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PIE DE PÁGINA CON SOPORTE */}
        <div className="text-center pt-4 text-xs text-[#1A1A1A]/60 space-y-2">
          <p>¿Tienes dudas o necesitas ayuda para subir algún documento?</p>
          <a
            href="https://wa.me/524774654700"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 font-bold text-[#5C7A52] hover:underline"
          >
            <span>💬 Escríbenos a nuestro WhatsApp oficial: 477 465 4700</span>
          </a>
          <p className="text-[10px] text-[#1A1A1A]/40 pt-2">
            SAUCEDA Bienes Raíces & Construcción · Trámite Seguro y Confiable
          </p>
        </div>
      </div>
    </main>
  );
}
