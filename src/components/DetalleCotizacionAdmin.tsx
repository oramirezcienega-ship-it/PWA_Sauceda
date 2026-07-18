"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  guardarReporteVisita,
  guardarConceptosCotizacion,
  aprobarCotizacionComercial,
  aprobarCotizacionOperativa,
  marcarComoEnviada,
  guardarCondicionesCotizacion,
  subirFotoVisita,
  actualizarRequerimientoVisita,
} from "@/app/actions/cotizaciones";
import { listarProductosServicios } from "@/app/actions/productos";
import { listarPerfilesActivos } from "@/app/actions/usuarios";
import type { Cotizacion, VisitaReporte, CotizacionConcepto, ServicioConstruccionTipo } from "@/lib/types";

interface DetalleCotizacionAdminProps {
  cotizacionInicial: Cotizacion;
  conceptosIniciales: CotizacionConcepto[];
  reporteVisitaInicial: VisitaReporte | null;
  rolUsuario: "admin" | "asesor" | "operaciones" | null;
}

export function DetalleCotizacionAdmin({
  cotizacionInicial,
  conceptosIniciales,
  reporteVisitaInicial,
  rolUsuario,
}: DetalleCotizacionAdminProps) {
  const router = useRouter();
  const [cotizacion, setCotizacion] = useState<Cotizacion>(cotizacionInicial);
  const [conceptos, setConceptos] = useState<CotizacionConcepto[]>(conceptosIniciales);
  const [reporteVisita, setReporteVisita] = useState<VisitaReporte | null>(reporteVisitaInicial);

  const [pestaña, setPestaña] = useState<"resumen" | "inspeccion" | "presupuesto" | "aprobacion">("resumen");

  // --- State para Inspección Técnica ---
  const [obsTecnicas, setObsTecnicas] = useState(reporteVisitaInicial?.observacionesTecnicas || "");
  const [condSitio, setCondSitio] = useState(reporteVisitaInicial?.condicionesSitio || "");
  const [largo, setLargo] = useState<string>(String(reporteVisitaInicial?.medidas?.largo || ""));
  const [ancho, setAncho] = useState<string>(String(reporteVisitaInicial?.medidas?.ancho || ""));
  const [altura, setAltura] = useState<string>(String(reporteVisitaInicial?.medidas?.altura || ""));
  const [fotoUrlInput, setFotoUrlInput] = useState("");
  const [fotos, setFotos] = useState<string[]>(reporteVisitaInicial?.fotos || []);
  const [guardandoInspeccion, setGuardandoInspeccion] = useState(false);
  const [mensajeInspeccion, setMensajeInspeccion] = useState({ tipo: "", texto: "" });

  const [tecnicoNombre, setTecnicoNombre] = useState(reporteVisitaInicial?.medidas?.tecnicoNombre || "");
  const [fechaVisitaRealizada, setFechaVisitaRealizada] = useState(
    reporteVisitaInicial?.medidas?.fechaVisita || (reporteVisitaInicial?.fechaInspeccion ? new Date(reporteVisitaInicial.fechaInspeccion).toISOString().split("T")[0] : new Date().toISOString().split("T")[0])
  );
  const [horaVisitaRealizada, setHoraVisitaRealizada] = useState(
    reporteVisitaInicial?.medidas?.horaVisita || (reporteVisitaInicial?.fechaInspeccion ? new Date(reporteVisitaInicial.fechaInspeccion).toTimeString().split(" ")[0].slice(0, 5) : new Date().toTimeString().split(" ")[0].slice(0, 5))
  );
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const [dictandoObs, setDictandoObs] = useState(false);
  const [dictandoCond, setDictandoCond] = useState(false);

  // --- State para Cambio de Requerimiento de Visita ---
  const [requiereVisita, setRequiereVisita] = useState(cotizacionInicial.requiereVisita);
  const [fechaVisitaPlan, setFechaVisitaPlan] = useState(
    cotizacionInicial.fechaVisita ? new Date(cotizacionInicial.fechaVisita).toISOString().slice(0, 16) : ""
  );
  const [inspectorIdPlan, setInspectorIdPlan] = useState(cotizacionInicial.inspectorId || "");
  const [guardandoRequerimiento, setGuardandoRequerimiento] = useState(false);
  const [mensajeRequerimiento, setMensajeRequerimiento] = useState({ tipo: "", texto: "" });
  const [inspectores, setInspectores] = useState<{ id: string; nombre: string; rol: string }[]>([]);

  // --- State para Presupuesto ---
  const [catalogoProductos, setCatalogoProductos] = useState<any[]>([]);
  const [conceptosEditables, setConceptosEditables] = useState<
    { descripcion: string; cantidad: number; unidad: string; costoUnitario: number; precioUnitario: number; descuento: number }[]
  >(
    conceptosIniciales.map((c) => ({
      descripcion: c.descripcion,
      cantidad: c.cantidad,
      unidad: c.unidad,
      costoUnitario: c.costoUnitario,
      precioUnitario: c.precioUnitario,
      descuento: c.descuento || 0,
    }))
  );

  useEffect(() => {
    listarProductosServicios()
      .then((prods) => {
        setCatalogoProductos(prods);
        
        // Auto-llenar costo unitario si es 0 y coincide con el catálogo
        setConceptosEditables((prev) =>
          prev.map((c) => {
            if (c.costoUnitario === 0) {
              const match = prods.find(
                (p) =>
                  p.nombre.toLowerCase() === c.descripcion.toLowerCase() ||
                  c.descripcion.toLowerCase().includes(p.nombre.toLowerCase()) ||
                  p.nombre.toLowerCase().includes(c.descripcion.toLowerCase())
              );
              if (match) {
                return { ...c, costoUnitario: match.costoUnitario };
              }
            }
            return c;
          })
        );
      })
      .catch(console.error);

    listarPerfilesActivos()
      .then(setInspectores)
      .catch(console.error);
  }, []);

  const [guardandoConceptos, setGuardandoConceptos] = useState(false);
  const [mensajeConceptos, setMensajeConceptos] = useState({ tipo: "", texto: "" });

  // --- State para Condiciones y Garantía ---
  const [condicionesPago, setCondicionesPago] = useState(cotizacionInicial.condicionesPago || "Anticipo del 50% para compra de materiales y programación de inicio; 50% al término a entera satisfacción.");
  const [garantia, setGarantia] = useState(cotizacionInicial.garantia || "Todos los trabajos cuentan con garantía técnica contra vicios ocultos de acuerdo al servicio contratado.");
  const [guardandoCondiciones, setGuardandoCondiciones] = useState(false);
  const [mensajeCondiciones, setMensajeCondiciones] = useState({ tipo: "", texto: "" });

  // --- State para Aprobaciones ---
  const [procesandoAprobacion, setProcesandoAprobacion] = useState(false);
  const [mensajeAprobacion, setMensajeAprobacion] = useState({ tipo: "", texto: "" });
  const [copiado, setCopiado] = useState(false);
  const [enviandoAPI, setEnviandoAPI] = useState(false);

  const handleActualizarRequerimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardandoRequerimiento(true);
      setMensajeRequerimiento({ tipo: "", texto: "" });
      const fVisita = requiereVisita ? new Date(fechaVisitaPlan).toISOString() : null;
      const insId = requiereVisita ? inspectorIdPlan : null;

      const actualizada = await actualizarRequerimientoVisita(
        cotizacion.id,
        requiereVisita,
        fVisita,
        insId
      );

      setCotizacion(actualizada);
      setMensajeRequerimiento({
        tipo: "ok",
        texto: "Configuración de visita técnica actualizada exitosamente."
      });
      if (!requiereVisita) {
        setReporteVisita(null);
      }
    } catch (err) {
      setMensajeRequerimiento({
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error al actualizar"
      });
    } finally {
      setGuardandoRequerimiento(false);
    }
  };

  const handleSubirFotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setSubiendoFotos(true);
      setMensajeInspeccion({ tipo: "", texto: "" });
      
      const nuevasUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("archivo", file);
        
        const res = await subirFotoVisita(formData);
        if (res && res.ok && res.url) {
          nuevasUrls.push(res.url);
        } else {
          console.error("Error al subir imagen:", res?.error || "Respuesta vacía del servidor.");
        }
      }

      if (nuevasUrls.length > 0) {
        setFotos((prev) => [...prev, ...nuevasUrls]);
        setMensajeInspeccion({
          tipo: "ok",
          texto: `Se cargaron ${nuevasUrls.length} imagen(es) con éxito.`
        });
      } else {
        setMensajeInspeccion({
          tipo: "error",
          texto: "No se pudo subir ninguna imagen."
        });
      }
    } catch (err) {
      setMensajeInspeccion({
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error al subir imágenes."
      });
    } finally {
      setSubiendoFotos(false);
      e.target.value = "";
    }
  };

  const iniciarDictado = (campo: "obs" | "cond") => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("El dictado por voz no es soportado por este navegador.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-MX";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    if (campo === "obs") setDictandoObs(true);
    if (campo === "cond") setDictandoCond(true);

    recognition.onresult = (event: any) => {
      const textoDictado = event.results[0][0].transcript;
      if (campo === "obs") {
        setObsTecnicas((prev) => prev ? `${prev} ${textoDictado}` : textoDictado);
      } else {
        setCondSitio((prev) => prev ? `${prev} ${textoDictado}` : textoDictado);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Error en dictado:", event.error);
      if (event.error === "not-allowed") {
        alert("Permiso de micrófono denegado.");
      }
    };

    recognition.onend = () => {
      if (campo === "obs") setDictandoObs(false);
      if (campo === "cond") setDictandoCond(false);
    };

    recognition.start();
  };

  // --- Acciones de Inspección ---
  const agregarFoto = () => {
    if (fotoUrlInput.trim()) {
      setFotos((prev) => [...prev, fotoUrlInput.trim()]);
      setFotoUrlInput("");
    }
  };

  const eliminarFoto = (index: number) => {
    setFotos((prev) => prev.filter((_, i) => i !== index));
  };
  const handleGuardarInspeccion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardandoInspeccion(true);
      setMensajeInspeccion({ tipo: "", texto: "" });

      const lVal = Number(largo) || 0;
      const aVal = Number(ancho) || 0;
      const hVal = Number(altura) || 0;
      const areaVal = lVal * aVal;

      // Combinar fecha y hora
      let customFechaInspeccion: string | undefined = undefined;
      if (fechaVisitaRealizada) {
        const timeStr = horaVisitaRealizada || "00:00";
        customFechaInspeccion = new Date(`${fechaVisitaRealizada}T${timeStr}`).toISOString();
      }

      const rep = await guardarReporteVisita(cotizacion.id, {
        observacionesTecnicas: obsTecnicas,
        condicionesSitio: condSitio,
        medidas: { 
          largo: lVal, 
          ancho: aVal, 
          altura: hVal, 
          areaCalculada: areaVal,
          tecnicoNombre: tecnicoNombre.trim(),
          fechaVisita: fechaVisitaRealizada,
          horaVisita: horaVisitaRealizada
        },
        fotos,
        fechaInspeccion: customFechaInspeccion
      });

      setReporteVisita(rep);
      setMensajeInspeccion({ tipo: "ok", texto: "Reporte de inspección técnica guardado exitosamente." });
      
      setCotizacion(prev => ({
        ...prev,
        estatus: prev.estatus === "esperando_visita" ? "calculando_costo" : prev.estatus
      }));
    } catch (err) {
      setMensajeInspeccion({ tipo: "error", texto: err instanceof Error ? err.message : "Error al guardar" });
    } finally {
      setGuardandoInspeccion(false);
    }
  };

  // --- Acciones de Presupuesto ---
  const agregarFilaConcepto = () => {
    setConceptosEditables((prev) => [
      ...prev,
      { descripcion: "", cantidad: 1, unidad: "m2", costoUnitario: 0, precioUnitario: 0, descuento: 0 },
    ]);
  };

  const eliminarFilaConcepto = (index: number) => {
    setConceptosEditables((prev) => prev.filter((_, i) => i !== index));
  };

  const actualizarFilaConcepto = (index: number, campo: string, valor: any) => {
    setConceptosEditables((prev) =>
      prev.map((c, i) => {
        if (i === index) {
          return { ...c, [campo]: valor };
        }
        return c;
      })
    );
  };

  const handleCargarDesdeCatalogo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const prodId = e.target.value;
    if (!prodId) return;
    const prod = catalogoProductos.find((p) => p.id === prodId);
    if (!prod) return;

    setConceptosEditables((prev) => [
      ...prev,
      {
        descripcion: prod.nombre,
        cantidad: 1,
        unidad: prod.unidad,
        costoUnitario: prod.costoUnitario,
        precioUnitario: prod.precioUnitario,
        descuento: 0,
      },
    ]);
    e.target.value = "";
  };

  const handleGuardarConceptos = async () => {
    // Validar conceptos
    if (conceptosEditables.length === 0) {
      setMensajeConceptos({ tipo: "error", texto: "Debe agregar al menos un concepto de presupuesto." });
      return;
    }
    if (conceptosEditables.some((c) => !c.descripcion.trim() || c.cantidad <= 0 || c.precioUnitario <= 0)) {
      setMensajeConceptos({ tipo: "error", texto: "Por favor, completa todas las filas con valores válidos." });
      return;
    }

    try {
      setGuardandoConceptos(true);
      setMensajeConceptos({ tipo: "", texto: "" });
      const res = await guardarConceptosCotizacion(cotizacion.id, conceptosEditables);

      if (res.ok) {
        setMensajeConceptos({ tipo: "ok", texto: "Presupuesto guardado. Firmas reseteadas y estatus cambiado a Pendiente Aprobación." });
        setCotizacion((prev) => ({
          ...prev,
          costoEstimado: res.costoEstimado,
          precioFinal: res.precioFinal,
          aprobadoComercial: false,
          aprobadoComercialBy: null,
          aprobadoComercialByNombre: "",
          aprobadoOperativo: false,
          aprobadoOperativoBy: null,
          aprobadoOperativoByNombre: "",
          estatus: "pendiente_aprobacion",
        }));
        
        // Refrescar conceptos de base de datos
        setConceptos(conceptosEditables.map((c, idx) => {
          const desc = c.descuento || 0;
          const precioConDescuento = c.precioUnitario * (1 - desc / 100);
          return {
            id: `temp-${idx}`,
            cotizacionId: cotizacion.id,
            descripcion: c.descripcion,
            cantidad: c.cantidad,
            unidad: c.unidad,
            costoUnitario: c.costoUnitario,
            precioUnitario: c.precioUnitario,
            descuento: desc,
            importe: c.cantidad * precioConDescuento,
            createdAt: new Date().toISOString()
          };
        }));
      }
    } catch (err) {
      setMensajeConceptos({ tipo: "error", texto: err instanceof Error ? err.message : "Error al guardar conceptos" });
    } finally {
      setGuardandoConceptos(false);
    }
  };

  const handleGuardarCondiciones = async () => {
    try {
      setGuardandoCondiciones(true);
      setMensajeCondiciones({ tipo: "", texto: "" });
      const res = await guardarCondicionesCotizacion(cotizacion.id, condicionesPago.trim(), garantia.trim());
      setCotizacion(res);
      setMensajeCondiciones({ tipo: "ok", texto: "Condiciones de servicio y garantía guardadas con éxito." });
    } catch (err) {
      setMensajeCondiciones({ tipo: "error", texto: err instanceof Error ? err.message : "Error al guardar condiciones" });
    } finally {
      setGuardandoCondiciones(false);
    }
  };

  // --- Acciones de Aprobaciones ---
  const handleAprobarComercial = async (aprobar: boolean) => {
    try {
      setProcesandoAprobacion(true);
      setMensajeAprobacion({ tipo: "", texto: "" });
      const res = await aprobarCotizacionComercial(cotizacion.id, aprobar);
      setCotizacion(res.cotizacion);
      setMensajeAprobacion({
        tipo: "ok",
        texto: aprobar ? "Aprobación Comercial firmada con éxito." : "Cotización rechazada comercialmente.",
      });
    } catch (err) {
      setMensajeAprobacion({ tipo: "error", texto: err instanceof Error ? err.message : "Error al procesar" });
    } finally {
      setProcesandoAprobacion(false);
    }
  };

  const handleAprobarOperativo = async (aprobar: boolean) => {
    try {
      setProcesandoAprobacion(true);
      setMensajeAprobacion({ tipo: "", texto: "" });
      const res = await aprobarCotizacionOperativa(cotizacion.id, aprobar);
      setCotizacion(res.cotizacion);
      setMensajeAprobacion({
        tipo: "ok",
        texto: aprobar ? "Aprobación Operativa firmada con éxito." : "Cotización rechazada operativamente.",
      });
    } catch (err) {
      setMensajeAprobacion({ tipo: "error", texto: err instanceof Error ? err.message : "Error al procesar" });
    } finally {
      setProcesandoAprobacion(false);
    }
  };

  const handleMarcarEnviada = async () => {
    try {
      setProcesandoAprobacion(true);
      setMensajeAprobacion({ tipo: "", texto: "" });
      const res = await marcarComoEnviada(cotizacion.id);
      setCotizacion(res);
      setMensajeAprobacion({ tipo: "ok", texto: "Cotización enviada al cliente. Enlace público activo." });
    } catch (err) {
      setMensajeAprobacion({ tipo: "error", texto: err instanceof Error ? err.message : "Error al enviar" });
    } finally {
      setProcesandoAprobacion(false);
    }
  };

  const baseEnlace = typeof window !== "undefined" ? window.location.origin : "https://app.saucedamx.com";
  const enlaceCliente = `${baseEnlace}/cotizacion/${cotizacion.token}`;

  const copiarEnlace = () => {
    navigator.clipboard.writeText(enlaceCliente);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleEnviarWhatsAppAPI = async () => {
    if (!cotizacion.prospectoTelefono) return;
    try {
      setEnviandoAPI(true);
      setMensajeAprobacion({ tipo: "", texto: "" });
      
      const textoMensaje = `Hola ${cotizacion.prospectoNombre?.split(" ")[0]}, te comparto la propuesta comercial y cotización para el servicio en tu domicilio. En el siguiente enlace puedes revisar a detalle los conceptos, descargar la cotización en PDF y autorizarla en línea por sistema: ${enlaceCliente}`;

      const { responderConversacion } = await import("@/app/actions/conversaciones");
      const res = await responderConversacion(cotizacion.prospectoTelefono, textoMensaje);

      if (res.ok) {
        setMensajeAprobacion({
          tipo: "ok",
          texto: "Mensaje enviado con éxito y registrado en la conversación del cliente ✓",
        });
      } else {
        setMensajeAprobacion({
          tipo: "error",
          texto: res.error || "Fallo al enviar el mensaje de WhatsApp desde el chat.",
        });
      }
    } catch (err) {
      setMensajeAprobacion({
        tipo: "error",
        texto: err instanceof Error ? err.message : "Error al enviar por API.",
      });
    } finally {
      setEnviandoAPI(false);
    }
  };

  const formatMoneda = (val: number) => {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val);
  };

  const margen = cotizacion.precioFinal > 0
    ? ((cotizacion.precioFinal - cotizacion.costoEstimado) / cotizacion.precioFinal) * 100
    : 0;

  // Permisos según Rol
  const esAdmin = rolUsuario === "admin";
  const esAsesor = rolUsuario === "asesor";
  const esOperaciones = rolUsuario === "operaciones";

  const puedeInspeccionar = esAdmin || esOperaciones;
  const puedeCostear = esAdmin || esAsesor || esOperaciones;
  const puedeAprobarComercial = esAdmin || esAsesor;
  const puedeAprobarOperativo = esAdmin || esOperaciones;

  return (
    <div className="space-y-6">
      {/* Encabezado Ficha */}
      <div className="bg-gradient-to-r from-verde-profundo to-sauce p-6 rounded-2xl text-white shadow-md flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs bg-crema/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Sauceda Construye</span>
            <span className="font-mono text-lg font-bold text-dorado">{cotizacion.id}</span>
          </div>
          <h2 className="font-titular text-2xl font-semibold mt-1 text-crema">{cotizacion.prospectoNombre}</h2>
          <p className="text-xs text-crema/80 font-cuerpo mt-1">
            Creada el {new Date(cotizacion.createdAt).toLocaleDateString()} · Tipo:{" "}
            <span className="font-semibold">{cotizacion.servicioTipo.toUpperCase()}</span>
          </p>
        </div>
        <div className="bg-white/10 px-4 py-3 rounded-xl border border-white/10 text-right">
          <div className="text-xs text-crema/70 uppercase font-semibold">Precio Final Cliente</div>
          <div className="font-mono text-2xl font-bold text-dorado">
            {cotizacion.precioFinal > 0 ? formatMoneda(cotizacion.precioFinal) : "$0.00"}
          </div>
          <div className="text-[10px] text-crema/60 mt-1 uppercase font-semibold">
            Estatus: <span className="text-crema font-bold">{cotizacion.estatus.replace("_", " ")}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-carbon/10 gap-1 font-titular">
        <button
          onClick={() => setPestaña("resumen")}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 -mb-[2px] ${
            pestaña === "resumen" ? "border-sauce text-sauce bg-white" : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          Resumen
        </button>
        <button
          onClick={() => setPestaña("inspeccion")}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 -mb-[2px] ${
            pestaña === "inspeccion" ? "border-sauce text-sauce bg-white" : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          Visita Técnica
        </button>
        <button
          onClick={() => setPestaña("presupuesto")}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 -mb-[2px] ${
            pestaña === "presupuesto" ? "border-sauce text-sauce bg-white" : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          Presupuesto
        </button>
        <button
          onClick={() => setPestaña("aprobacion")}
          className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 -mb-[2px] ${
            pestaña === "aprobacion" ? "border-sauce text-sauce bg-white" : "border-transparent text-carbon/60 hover:text-carbon"
          }`}
        >
          Aprobaciones & Envío
        </button>
      </div>

      {/* Contenido Pestañas */}
      <div className="bg-white p-6 rounded-2xl border border-carbon/10 shadow-sm font-cuerpo">
        
        {/* --- PESTAÑA RESUMEN --- */}
        {pestaña === "resumen" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-titular text-lg font-semibold text-verde-profundo border-b pb-2">Información Comercial</h3>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b"><td className="py-2 text-carbon/50">Cliente</td><td className="py-2 font-semibold">{cotizacion.prospectoNombre}</td></tr>
                    <tr className="border-b"><td className="py-2 text-carbon/50">Teléfono</td><td className="py-2 font-mono">{cotizacion.prospectoTelefono}</td></tr>
                    <tr className="border-b"><td className="py-2 text-carbon/50">Estatus de la Cotización</td><td className="py-2 capitalize font-semibold text-sauce">{cotizacion.estatus.replace("_", " ")}</td></tr>
                    <tr className="border-b"><td className="py-2 text-carbon/50">Fecha de Visita Técnica</td><td className="py-2">{cotizacion.fechaVisita ? new Date(cotizacion.fechaVisita).toLocaleString() : "No agendada"}</td></tr>
                    <tr><td className="py-2 text-carbon/50">Notas Internas</td><td className="py-2 text-carbon/80 italic">{cotizacion.notasInternas || "Ninguna"}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="space-y-4">
                <h3 className="font-titular text-lg font-semibold text-verde-profundo border-b pb-2">Métricas Financieras</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-carbon/5">
                    <div className="text-xs text-carbon/50 uppercase font-semibold">Costo Interno (MO + Mat)</div>
                    <div className="font-mono text-xl font-bold text-carbon mt-1">
                      {esOperaciones && !esAdmin ? "Oculto" : formatMoneda(cotizacion.costoEstimado)}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-carbon/5">
                    <div className="text-xs text-carbon/50 uppercase font-semibold">Precio al Cliente</div>
                    <div className="font-mono text-xl font-bold text-verde-profundo mt-1">{formatMoneda(cotizacion.precioFinal)}</div>
                  </div>
                </div>

                {(!esOperaciones || esAdmin) && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-carbon/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-carbon/50 uppercase font-semibold">Margen Estimado</div>
                      <div className="text-xs text-carbon/40 mt-0.5">Rentabilidad esperada</div>
                    </div>
                    <div className={`font-mono text-2xl font-extrabold ${margen >= 30 ? "text-green-600" : margen >= 15 ? "text-amber-500" : "text-rose-600"}`}>
                      {margen.toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Resumen del reporte si existe */}
            {reporteVisita && (
              <div className="bg-slate-50 p-4 rounded-xl border border-carbon/5 mt-4 space-y-2">
                <h4 className="font-titular font-semibold text-carbon/80 text-sm">Resumen de Inspección Técnica</h4>
                <p className="text-sm text-carbon/70">{reporteVisita.observacionesTecnicas}</p>
                {reporteVisita.medidas && (
                  <div className="flex gap-4 text-xs font-mono text-carbon/60">
                    <span>Área: {reporteVisita.medidas.areaCalculada || 0} m²</span>
                    <span>Largo: {reporteVisita.medidas.largo || 0}m</span>
                    <span>Ancho: {reporteVisita.medidas.ancho || 0}m</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {/* --- PESTAÑA VISITA TÉCNICA (INSPECCIÓN) --- */}
        {pestaña === "inspeccion" && (
          <div className="space-y-6">
            {/* Configuración del Requerimiento de Visita */}
            <div className="bg-slate-50 border border-carbon/10 p-5 rounded-2xl space-y-4">
              <div>
                <h4 className="font-titular font-semibold text-sm text-verde-profundo">Configuración de Visita Técnica</h4>
                <p className="text-xs text-carbon/50 mt-0.5">Controla si este expediente requiere visita física y asigna al inspector correspondiente.</p>
              </div>

              {mensajeRequerimiento.texto && (
                <div className={`p-3 text-xs border rounded-lg ${
                  mensajeRequerimiento.tipo === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-rose-50 border-rojo/20 text-rojo"
                }`}>
                  {mensajeRequerimiento.texto}
                </div>
              )}

              <form onSubmit={handleActualizarRequerimiento} className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="adminRequiereVisita"
                    checked={requiereVisita}
                    onChange={(e) => setRequiereVisita(e.target.checked)}
                    className="rounded text-sauce focus:ring-sauce h-4 w-4"
                  />
                  <label htmlFor="adminRequiereVisita" className="text-sm font-medium text-carbon/80 cursor-pointer">
                    ¿Esta cotización requiere inspección física en el domicilio?
                  </label>
                </div>

                {requiereVisita && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Fecha Programada</label>
                      <input
                        type="datetime-local"
                        value={fechaVisitaPlan}
                        onChange={(e) => setFechaVisitaPlan(e.target.value)}
                        required={requiereVisita}
                        className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Inspector / Operario Asignado</label>
                      <select
                        value={inspectorIdPlan}
                        onChange={(e) => setInspectorIdPlan(e.target.value)}
                        required={requiereVisita}
                        className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none bg-white"
                      >
                        <option value="">-- Selecciona un inspector --</option>
                        {inspectores.map((ins) => (
                          <option key={ins.id} value={ins.id}>{ins.nombre} ({ins.rol})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={guardandoRequerimiento}
                    className="rounded-lg bg-verde-profundo text-white px-4 py-2 text-xs font-semibold hover:bg-sauce transition disabled:opacity-50"
                  >
                    {guardandoRequerimiento ? "Actualizando..." : "Actualizar Configuración"}
                  </button>
                </div>
              </form>
            </div>

            {/* Ficha de Levantamiento Técnico */}
            <div className="flex items-center justify-between border-b pb-2 pt-4">
              <div className="flex items-center gap-4">
                <h3 className="font-titular text-lg font-semibold text-verde-profundo">Reporte de Levantamiento Físico</h3>
                {reporteVisita && (
                  <a
                    href={`/reporte-visita/${cotizacion.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-sauce/15 text-sauce hover:bg-sauce hover:text-white px-2.5 py-1 rounded font-semibold transition flex items-center gap-1"
                  >
                    📄 Ver Reporte del Cliente
                  </a>
                )}
              </div>
              {reporteVisita && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-mono font-bold">Levantado por {reporteVisita.inspectorNombre}</span>
              )}
            </div>

            {!puedeInspeccionar ? (
              <p className="text-sm text-carbon/50 py-6 text-center">Tu rol no tiene permisos para modificar el reporte técnico de la visita.</p>
            ) : (
              <form onSubmit={handleGuardarInspeccion} className="space-y-4">
                {mensajeInspeccion.texto && (
                  <div className={`p-3 text-xs border rounded-lg ${
                    mensajeInspeccion.tipo === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-rose-50 border-rojo/20 text-rojo"
                  }`}>
                    {mensajeInspeccion.texto}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Técnico / Operario Visitador</label>
                    <input
                      type="text"
                      value={tecnicoNombre}
                      onChange={(e) => setTecnicoNombre(e.target.value)}
                      placeholder="Nombre del técnico"
                      className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Fecha de Visita Realizada</label>
                    <input
                      type="date"
                      value={fechaVisitaRealizada}
                      onChange={(e) => setFechaVisitaRealizada(e.target.value)}
                      required
                      className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Hora de Visita Realizada</label>
                    <input
                      type="time"
                      value={horaVisitaRealizada}
                      onChange={(e) => setHoraVisitaRealizada(e.target.value)}
                      required
                      className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Largo (metros)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={largo}
                      onChange={(e) => setLargo(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Ancho (metros)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={ancho}
                      onChange={(e) => setAncho(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Altura de Trabajo (m) - Opcional</label>
                    <input
                      type="number"
                      step="0.01"
                      value={altura}
                      onChange={(e) => setAltura(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                    />
                  </div>
                </div>

                <div className="text-xs font-mono text-carbon/50 pt-1">
                  Área estimada calculada: <span className="font-bold text-verde-profundo font-mono text-sm">{(Number(largo || 0) * Number(ancho || 0)).toFixed(2)} m²</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1 flex justify-between items-center">
                    <span>Condiciones del Sitio</span>
                    <button
                      type="button"
                      onClick={() => iniciarDictado("cond")}
                      className={`text-xs font-semibold flex items-center gap-1.5 px-2 py-0.5 rounded transition ${
                        dictandoCond ? "bg-red-100 text-red-700 animate-pulse font-titular" : "bg-slate-100 text-carbon/60 hover:bg-slate-200 font-titular"
                      }`}
                    >
                      {dictandoCond ? "🔴 Escuchando..." : "🎙️ Dictar por Voz"}
                    </button>
                  </label>
                  <input
                    type="text"
                    value={condSitio}
                    onChange={(e) => setCondSitio(e.target.value)}
                    placeholder="Ej. Humedad alta, requiere limpieza de superficie, andamios necesarios"
                    className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1 flex justify-between items-center">
                    <span>Observaciones Técnicas y Recomendaciones</span>
                    <button
                      type="button"
                      onClick={() => iniciarDictado("obs")}
                      className={`text-xs font-semibold flex items-center gap-1.5 px-2 py-0.5 rounded transition ${
                        dictandoObs ? "bg-red-100 text-red-700 animate-pulse font-titular" : "bg-slate-100 text-carbon/60 hover:bg-slate-200 font-titular"
                      }`}
                    >
                      {dictandoObs ? "🔴 Escuchando..." : "🎙️ Dictar por Voz"}
                    </button>
                  </label>
                  <textarea
                    value={obsTecnicas}
                    onChange={(e) => setObsTecnicas(e.target.value)}
                    rows={4}
                    required
                    placeholder="Escribe aquí las observaciones del sitio, preparación de la superficie recomendada, etc."
                    className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                  />
                </div>

                {/* Captura de Fotos */}
                <div className="space-y-2 border-t pt-4">
                  <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Fotografías del Sitio (Anteproyecto)</label>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      type="url"
                      value={fotoUrlInput}
                      onChange={(e) => setFotoUrlInput(e.target.value)}
                      placeholder="Pega la URL de una foto"
                      className="flex-1 min-w-[200px] rounded-lg border border-carbon/20 px-3 py-2 text-sm focus:border-sauce focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={agregarFoto}
                      className="rounded-lg bg-slate-100 text-carbon/80 border px-4 py-2 text-sm font-semibold hover:bg-slate-200 transition"
                    >
                      Añadir URL
                    </button>
                    <div className="relative">
                      <input
                        type="file"
                        id="select-fotos-visita"
                        multiple
                        accept="image/*"
                        onChange={handleSubirFotos}
                        className="hidden"
                      />
                      <label
                        htmlFor="select-fotos-visita"
                        className={`inline-flex items-center justify-center rounded-lg bg-sauce text-white px-4 py-2 text-sm font-semibold hover:bg-verde-profundo transition cursor-pointer select-none ${
                          subiendoFotos ? "opacity-50 pointer-events-none" : ""
                        }`}
                      >
                        {subiendoFotos ? "📸 Subiendo..." : "📸 Subir Fotos (Multi)"}
                      </label>
                    </div>
                  </div>

                  {fotos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      {fotos.map((f, idx) => (
                        <div key={idx} className="relative rounded-lg border overflow-hidden aspect-video group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f} alt={`Levantamiento ${idx + 1}`} className="object-cover w-full h-full" />
                          <button
                            type="button"
                            onClick={() => eliminarFoto(idx)}
                            className="absolute top-1 right-1 h-6 w-6 bg-rojo/90 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    disabled={guardandoInspeccion}
                    className="rounded-lg bg-sauce px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-verde-profundo disabled:opacity-50"
                  >
                    {guardandoInspeccion ? "Guardando..." : "Guardar Reporte Técnico"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* --- PESTAÑA PRESUPUESTO (CONCEPTOS) --- */}
        {pestaña === "presupuesto" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
              <div>
                <h3 className="font-titular text-lg font-semibold text-verde-profundo">Presupuesto de Obra</h3>
                <p className="text-xs text-carbon/40 mt-0.5">El desglose de materiales, mano de obra y rendimientos.</p>
              </div>
              {puedeCostear && (
                <div className="flex flex-wrap items-center gap-2">
                  {catalogoProductos.length > 0 && (
                    <select
                      onChange={handleCargarDesdeCatalogo}
                      defaultValue=""
                      className="rounded-lg border border-carbon/20 bg-white px-3 py-1.5 text-xs font-semibold text-carbon/70 outline-none focus:border-sauce"
                    >
                      <option value="">📦 Seleccionar de Catálogo...</option>
                      {catalogoProductos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} ({formatMoneda(p.precioUnitario)})
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={agregarFilaConcepto}
                    className="rounded-lg bg-sauce/15 text-sauce px-3 py-1.5 text-xs font-semibold hover:bg-sauce hover:text-white transition whitespace-nowrap"
                  >
                    + Agregar Concepto Libre
                  </button>
                </div>
              )}
            </div>

            {!puedeCostear ? (
              <p className="text-sm text-carbon/50 py-6 text-center">Tu rol no tiene permisos para cotizar conceptos financieros.</p>
            ) : (
              <div className="space-y-6 font-sans">
                <div className="space-y-4">
                {mensajeConceptos.texto && (
                  <div className={`p-3 text-xs border rounded-lg ${
                    mensajeConceptos.tipo === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-rose-50 border-rojo/20 text-rojo"
                  }`}>
                    {mensajeConceptos.texto}
                  </div>
                )}

                {conceptosEditables.length === 0 ? (
                  <div className="p-8 text-center text-carbon/40 border border-dashed rounded-xl">
                    No hay conceptos en el presupuesto. Carga uno del catálogo o haz clic en "+ Agregar Concepto Libre" para comenzar.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs min-w-[750px]">
                      <thead>
                        <tr className="border-b border-carbon/10 text-carbon/40 font-semibold uppercase tracking-wider">
                          <th className="pb-2 w-[35%]">Descripción del Concepto</th>
                          <th className="pb-2 text-center w-[8%]">Cant.</th>
                          <th className="pb-2 text-center w-[8%]">Unidad</th>
                          {(!esOperaciones || esAdmin) && <th className="pb-2 text-right w-[11%]">Costo Int. Unit.</th>}
                          <th className="pb-2 text-right w-[11%]">Precio Unit.</th>
                          <th className="pb-2 text-center w-[10%]">Desc. %</th>
                          <th className="pb-2 text-right w-[12%]">Importe</th>
                          <th className="pb-2 text-center w-[5%]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-carbon/5 font-cuerpo">
                        {conceptosEditables.map((c, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5">
                              <input
                                type="text"
                                value={c.descripcion}
                                onChange={(e) => actualizarFilaConcepto(idx, "descripcion", e.target.value)}
                                placeholder="Ej. Impermeabilización Fester 5 años..."
                                className="w-full rounded border border-carbon/15 px-2 py-1 focus:border-sauce focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 text-center">
                              <input
                                type="number"
                                step="0.01"
                                value={c.cantidad}
                                onChange={(e) => actualizarFilaConcepto(idx, "cantidad", Number(e.target.value))}
                                className="w-16 rounded border border-carbon/15 px-1 py-1 text-center focus:border-sauce focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 text-center">
                              <select
                                value={c.unidad}
                                onChange={(e) => actualizarFilaConcepto(idx, "unidad", e.target.value)}
                                className="rounded border border-carbon/15 px-1 py-1 focus:border-sauce focus:outline-none"
                              >
                                <option value="m2">m²</option>
                                <option value="ml">ml</option>
                                <option value="pza">pza</option>
                                <option value="lote">lote</option>
                                <option value="m3">m³</option>
                                <option value="servicio">servicio</option>
                              </select>
                            </td>
                            {(!esOperaciones || esAdmin) && (
                              <td className="py-2.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-carbon/40">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={c.costoUnitario}
                                    onChange={(e) => actualizarFilaConcepto(idx, "costoUnitario", Number(e.target.value))}
                                    className="w-20 rounded border border-carbon/15 px-1 py-1 text-right focus:border-sauce focus:outline-none"
                                  />
                                </div>
                              </td>
                            )}
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                  <span className="text-carbon/40">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={c.precioUnitario}
                                  onChange={(e) => actualizarFilaConcepto(idx, "precioUnitario", Number(e.target.value))}
                                  className="w-20 rounded border border-carbon/15 px-1 py-1 text-right focus:border-sauce focus:outline-none"
                                />
                              </div>
                            </td>
                            <td className="py-2.5 text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={c.descuento || 0}
                                  onChange={(e) => actualizarFilaConcepto(idx, "descuento", Math.min(100, Math.max(0, Number(e.target.value))))}
                                  className="w-12 rounded border border-carbon/15 px-1 py-1 text-center focus:border-sauce focus:outline-none"
                                />
                                <span className="text-carbon/40">%</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-mono font-semibold text-carbon/80">
                              {formatMoneda(c.cantidad * c.precioUnitario * (1 - (c.descuento || 0) / 100))}
                            </td>
                            <td className="py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => eliminarFilaConcepto(idx)}
                                className="text-rojo hover:text-rose-800 text-sm p-1"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="border-t pt-4 flex flex-wrap justify-between items-center gap-4">
                  <div className="text-xs text-carbon/50">
                    Nota: Al guardar conceptos se resetean las firmas comerciales y operativas por seguridad.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={guardandoConceptos}
                      onClick={handleGuardarConceptos}
                      className="rounded-lg bg-sauce px-5 py-2 text-sm font-semibold text-white transition hover:bg-verde-profundo disabled:opacity-50 shadow-sm"
                    >
                      {guardandoConceptos ? "Guardando..." : "Guardar Presupuesto"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Editor de Condiciones Comerciales y Garantía */}
                <div className="bg-slate-50 border border-carbon/10 p-5 rounded-2xl space-y-4 mt-6">
                  <div>
                    <h4 className="font-titular font-semibold text-sm text-verde-profundo">Condiciones Comerciales & Garantía</h4>
                    <p className="text-xs text-carbon/50 mt-0.5">Edita las formas de pago y garantía que aparecerán en la propuesta del cliente.</p>
                  </div>

                  {mensajeCondiciones.texto && (
                    <div className={`p-3 text-xs border rounded-lg ${
                      mensajeCondiciones.tipo === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-rose-50 border-rojo/20 text-rojo"
                    }`}>
                      {mensajeCondiciones.texto}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Forma de Pago / Condiciones Comerciales</label>
                      <textarea
                        value={condicionesPago}
                        onChange={(e) => setCondicionesPago(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs focus:border-sauce focus:outline-none font-sans"
                        placeholder="Ej. Anticipo del 50%..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Términos de Garantía</label>
                      <textarea
                        value={garantia}
                        onChange={(e) => setGarantia(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs focus:border-sauce focus:outline-none font-sans"
                        placeholder="Ej. Todos los trabajos cuentan con garantía..."
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      disabled={guardandoCondiciones}
                      onClick={handleGuardarCondiciones}
                      className="rounded-lg bg-verde-profundo px-4 py-2 text-xs font-semibold text-white hover:bg-sauce disabled:opacity-50 transition shadow-sm"
                    >
                      {guardandoCondiciones ? "Guardando..." : "Guardar Condiciones"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA APROBACIONES & ENVÍO --- */}
        {pestaña === "aprobacion" && (
          <div className="space-y-6">
            <h3 className="font-titular text-lg font-semibold text-verde-profundo border-b pb-2">Estatus de Firmas de Autorización</h3>

            {mensajeAprobacion.texto && (
              <div className={`p-3 text-xs border rounded-lg ${
                mensajeAprobacion.tipo === "ok" ? "bg-green-50 border-green-200 text-green-700" : "bg-rose-50 border-rojo/20 text-rojo"
              }`}>
                {mensajeAprobacion.texto}
              </div>
            )}

            {/* Mensajes de Validación Operativa */}
            {cotizacion.requiereVisita && !reporteVisita && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium">
                ⚠️ Esta cotización tiene visita técnica física programada, pero aún no se ha registrado el reporte (no bloquea aprobación).
              </div>
            )}
            {conceptos.length === 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium">
                ⚠️ Falta calcular y guardar los conceptos de presupuesto antes de proceder a la aprobación.
              </div>
            )}

            {/* Cuadro de Aprobación Dual */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Bloque Comercial */}
              <div className={`p-5 rounded-2xl border ${cotizacion.aprobadoComercial ? "border-green-200 bg-green-50/30" : "border-slate-200 bg-slate-50/50"}`}>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-titular font-semibold text-sm">1. Aprobación Comercial</h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cotizacion.aprobadoComercial ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}`}>
                    {cotizacion.aprobadoComercial ? "Firmado" : "Pendiente"}
                  </span>
                </div>
                <p className="text-xs text-carbon/60 mb-4">
                  Valida viabilidad del precio de venta, rentabilidad, posibles descuentos y relación comercial general.
                </p>
                {cotizacion.aprobadoComercial ? (
                  <div className="text-xs text-carbon/70">
                    <div>Firmado por: <span className="font-semibold">{cotizacion.aprobadoComercialByNombre}</span></div>
                    {puedeAprobarComercial && (
                      <button
                        onClick={() => handleAprobarComercial(false)}
                        disabled={procesandoAprobacion}
                        className="mt-3 text-xs text-rojo hover:underline"
                      >
                        Retirar aprobación
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    {puedeAprobarComercial ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAprobarComercial(true)}
                          disabled={procesandoAprobacion || conceptos.length === 0}
                          className="rounded-lg bg-green-600 text-white px-4 py-2 text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition"
                        >
                          Firmar Aprobación
                        </button>
                        <button
                          onClick={() => handleAprobarComercial(false)}
                          disabled={procesandoAprobacion}
                          className="rounded-lg bg-rose-50 text-rojo border border-rojo/20 px-4 py-2 text-xs font-semibold hover:bg-rose-100 transition"
                        >
                          Rechazar
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-carbon/40 italic">Solo asesores o administradores pueden firmar esta sección.</span>
                    )}
                  </div>
                )}
              </div>

              {/* Bloque Operativo */}
              <div className={`p-5 rounded-2xl border ${cotizacion.aprobadoOperativo ? "border-green-200 bg-green-50/30" : "border-slate-200 bg-slate-50/50"}`}>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-titular font-semibold text-sm">2. Aprobación Operativa</h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cotizacion.aprobadoOperativo ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"}`}>
                    {cotizacion.aprobadoOperativo ? "Firmado" : "Pendiente"}
                  </span>
                </div>
                <p className="text-xs text-carbon/60 mb-4">
                  Valida viabilidad técnica en obra, materiales calculados, disponibilidad de mano de obra y tiempos de ejecución.
                </p>
                {cotizacion.aprobadoOperativo ? (
                  <div className="text-xs text-carbon/70">
                    <div>Firmado por: <span className="font-semibold">{cotizacion.aprobadoOperativoByNombre}</span></div>
                    {puedeAprobarOperativo && (
                      <button
                        onClick={() => handleAprobarOperativo(false)}
                        disabled={procesandoAprobacion}
                        className="mt-3 text-xs text-rojo hover:underline"
                      >
                        Retirar aprobación
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    {puedeAprobarOperativo ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAprobarOperativo(true)}
                          disabled={procesandoAprobacion || conceptos.length === 0}
                          className="rounded-lg bg-green-600 text-white px-4 py-2 text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition"
                        >
                          Firmar Aprobación
                        </button>
                        <button
                          onClick={() => handleAprobarOperativo(false)}
                          disabled={procesandoAprobacion}
                          className="rounded-lg bg-rose-50 text-rojo border border-rojo/20 px-4 py-2 text-xs font-semibold hover:bg-rose-100 transition"
                        >
                          Rechazar
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-carbon/40 italic">Solo personal operativo o administradores pueden firmar esta sección.</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Sección de Envío al Cliente */}
            <div className="border-t pt-6 space-y-4">
              <h4 className="font-titular font-semibold text-sm text-carbon/80">Distribución de Propuesta</h4>
              
              {cotizacion.aprobadoComercial && cotizacion.aprobadoOperativo ? (
                <div className="space-y-3">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium">
                    🎉 ¡Cotización autorizada por ambas áreas! Listo para enviar y presentar al cliente.
                  </div>

                  {cotizacion.estatus === "aprobada" ? (
                    <button
                      onClick={handleMarcarEnviada}
                      disabled={procesandoAprobacion}
                      className="rounded-lg bg-sauce text-white px-5 py-2.5 text-sm font-semibold hover:bg-verde-profundo transition shadow-sm"
                    >
                      Activar y Marcar como Enviada
                    </button>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-xl border border-carbon/5 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Enlace del Portal de Cliente</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={enlaceCliente}
                            className="flex-1 rounded-lg border border-carbon/20 px-3 py-2 text-xs font-mono bg-white focus:outline-none"
                          />
                          <button
                            onClick={copiarEnlace}
                            className="rounded-lg bg-slate-200 text-carbon/80 px-4 py-2 text-xs font-semibold hover:bg-slate-300 transition"
                          >
                            {copiado ? "Copiado!" : "Copiar"}
                          </button>
                        </div>
                      </div>

                      {reporteVisita && (
                        <div className="border-t pt-3">
                          <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Enlace del Reporte de Visita Técnica</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={`${baseEnlace}/reporte-visita/${cotizacion.token}`}
                              className="flex-1 rounded-lg border border-carbon/20 px-3 py-2 text-xs font-mono bg-white focus:outline-none"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${baseEnlace}/reporte-visita/${cotizacion.token}`);
                                alert("Enlace del reporte copiado al portapapeles.");
                              }}
                              className="rounded-lg bg-slate-200 text-carbon/80 px-4 py-2 text-xs font-semibold hover:bg-slate-300 transition"
                            >
                              Copiar
                            </button>
                            <a
                              href={`/reporte-visita/${cotizacion.token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-sauce/15 text-sauce px-4 py-2 text-xs font-semibold hover:bg-sauce hover:text-white transition flex items-center"
                            >
                              Ver Reporte
                            </a>
                          </div>
                          
                          <div className="flex gap-2 pt-2">
                            <a
                              href={`https://wa.me/${cotizacion.prospectoTelefono?.replace(/\s+/g, "")}?text=${encodeURIComponent(
                                `Hola ${cotizacion.prospectoNombre?.split(" ")[0]}, te comparto el Reporte de Levantamiento Técnico y Diagnóstico del servicio en tu domicilio. Puedes revisarlo a detalle en el siguiente enlace: ${baseEnlace}/reporte-visita/${cotizacion.token}`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-carbon/15 text-carbon/60 px-3 py-1.5 text-[10px] font-semibold hover:bg-slate-200 transition"
                            >
                              💬 Compartir Reporte por WhatsApp
                            </a>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2 flex-wrap">
                        {/* Compartir por WhatsApp Web */}
                        <a
                          href={`https://wa.me/${cotizacion.prospectoTelefono?.replace(/\s+/g, "")}?text=${encodeURIComponent(
                            `Hola ${cotizacion.prospectoNombre?.split(" ")[0]}, te comparto la propuesta comercial y cotización para el servicio en tu domicilio. En el siguiente enlace puedes revisar a detalle los conceptos, descargar la cotización en PDF y autorizarla en línea por sistema: ${enlaceCliente}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-100 border border-carbon/15 text-carbon/80 px-4 py-2 text-xs font-semibold hover:bg-slate-200 transition shadow-sm"
                        >
                          <svg className="w-4 h-4 fill-current text-[#25D366]" viewBox="0 0 24 24">
                            <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.37 5.054L2 22l5.13-1.346a9.945 9.945 0 004.88 1.28c5.505 0 9.988-4.478 9.989-9.984C22.01 6.477 17.528 2 12.012 2zm6.36 14.195c-.277.78-1.6 1.436-2.23 1.5-1.12.1-3.21-.6-5.71-3.1-2.07-2.07-3.07-4.14-3.07-5.13 0-1.12.77-1.74 1.1-2.04.28-.26.54-.3.72-.3.17 0 .34 0 .5.01.16 0 .38-.06.58.42.2.49.7 1.7.77 1.83.07.13.1.28.01.46-.09.18-.18.3-.32.46-.14.16-.3.36-.43.48-.15.14-.3.29-.13.58.18.29.8 1.3 1.7 2.1.86.76 1.8 1.14 2.1 1.28.3.14.47.12.65-.08.18-.2.78-.9.98-1.2.2-.3.4-.26.68-.16.27.1 1.73.81 2.03.96.3.15.5.22.58.36.08.14.08.82-.2 1.6z"/>
                          </svg>
                          Abrir WhatsApp Web
                        </a>

                        {/* Compartir por WhatsApp API oficial */}
                        <button
                          type="button"
                          onClick={handleEnviarWhatsAppAPI}
                          disabled={enviandoAPI || !cotizacion.prospectoTelefono}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] text-white px-4 py-2 text-xs font-semibold hover:bg-[#128C7E] transition shadow-sm disabled:opacity-50"
                        >
                          {/* SVG Whatsapp */}
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                            <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.37 5.054L2 22l5.13-1.346a9.945 9.945 0 004.88 1.28c5.505 0 9.988-4.478 9.989-9.984C22.01 6.477 17.528 2 12.012 2zm6.36 14.195c-.277.78-1.6 1.436-2.23 1.5-1.12.1-3.21-.6-5.71-3.1-2.07-2.07-3.07-4.14-3.07-5.13 0-1.12.77-1.74 1.1-2.04.28-.26.54-.3.72-.3.17 0 .34 0 .5.01.16 0 .38-.06.58.42.2.49.7 1.7.77 1.83.07.13.1.28.01.46-.09.18-.18.3-.32.46-.14.16-.3.36-.43.48-.15.14-.3.29-.13.58.18.29.8 1.3 1.7 2.1.86.76 1.8 1.14 2.1 1.28.3.14.47.12.65-.08.18-.2.78-.9.98-1.2.2-.3.4-.26.68-.16.27.1 1.73.81 2.03.96.3.15.5.22.58.36.08.14.08.82-.2 1.6z"/>
                          </svg>
                          {enviandoAPI ? "Enviando..." : "Enviar por WhatsApp (Chat CRM)"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 text-slate-500 rounded-xl text-xs">
                  La propuesta técnica y comercial debe estar plenamente aprobada por el área comercial y operativa antes de activar el portal del cliente.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
