"use client";

import { useEffect, useState, useMemo } from "react";
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
  crearRemisionFactura,
  editarRemisionFactura,
  obtenerRemisionFacturaDeCotizacion,
  obtenerGarantiaDocumento,
  guardarGarantiaDocumento,
  prepararGarantiaPorDefecto,
} from "@/app/actions/cotizaciones";
import { listarProductosServicios } from "@/app/actions/productos";
import { listarPerfilesActivos } from "@/app/actions/usuarios";
import type { Cotizacion, VisitaReporte, CotizacionConcepto, ServicioConstruccionTipo, RemisionFactura, GarantiaDocumento } from "@/lib/types";

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

  const [pestaña, setPestaña] = useState<"resumen" | "inspeccion" | "presupuesto" | "aprobacion" | "facturacion">("resumen");

  // --- State para Remisión & Factura ---
  const [remisionFactura, setRemisionFactura] = useState<RemisionFactura | null>(null);
  const [cargandoRemision, setCargandoRemision] = useState<boolean>(true);
  const [editandoRemision, setEditandoRemision] = useState<boolean>(false);

  // --- State para Cartas de Garantía ---
  const [garantiaDoc, setGarantiaDoc] = useState<GarantiaDocumento | null>(null);
  const [cargandoGarantia, setCargandoGarantia] = useState<boolean>(true);
  const [editandoGarantia, setEditandoGarantia] = useState<boolean>(false);
  const [garantiaTexto, setGarantiaTexto] = useState("");
  const [garantiaTitulo, setGarantiaTitulo] = useState("Carta de Garantía");
  const [mensajeGarantia, setMensajeGarantia] = useState({ tipo: "", texto: "" });
  const [guardandoGarantia, setGuardandoGarantia] = useState(false);

  // --- Formulario de Remisión / Factura ---
  const [tipoDoc, setTipoDoc] = useState<"remision" | "factura">("remision");
  const [folioDoc, setFolioDoc] = useState("");
  const [fechaDoc, setFechaDoc] = useState(new Date().toISOString().split("T")[0]);
  const [tipoCambioDoc, setTipoCambioDoc] = useState("1.00");
  const [serviciosExtraDoc, setServiciosExtraDoc] = useState("0.00");
  const [costoFinancieroDoc, setCostoFinancieroDoc] = useState("0.00");
  const [otrosGastosDoc, setOtrosGastosDoc] = useState("0.00");
  const [rfcDoc, setRfcDoc] = useState("");
  const [razonSocialDoc, setRazonSocialDoc] = useState("");
  const [regimenFiscalDoc, setRegimenFiscalDoc] = useState("");
  const [usoCfdiDoc, setUsoCfdiDoc] = useState("G03");
  const [direccionEntregaDoc, setDireccionEntregaDoc] = useState("");
  const [personaRecibeDoc, setPersonaRecibeDoc] = useState("");
  const [fechaInstalacionDoc, setFechaInstalacionDoc] = useState("");
  const [procesandoRemision, setProcesandoRemision] = useState(false);
  const [mensajeRemisionForm, setMensajeRemisionForm] = useState({ tipo: "", texto: "" });

  useEffect(() => {
    if (cotizacion.id) {
      const sufijo = cotizacion.id.replace("COT-", "");
      setFolioDoc(tipoDoc === "remision" ? `REM-${sufijo}` : `FAC-${sufijo}`);
    }
  }, [tipoDoc, cotizacion.id]);

  // --- State para Inspección Técnica ---
  const [obsTecnicas, setObsTecnicas] = useState(reporteVisitaInicial?.observacionesTecnicas || "");
  const [condSitio, setCondSitio] = useState(reporteVisitaInicial?.condicionesSitio || "");
  const [largo, setLargo] = useState<string>(String(reporteVisitaInicial?.medidas?.largo || ""));
  const [ancho, setAncho] = useState<string>(String(reporteVisitaInicial?.medidas?.ancho || ""));
  const [fotos, setFotos] = useState<string[]>(reporteVisitaInicial?.fotos || []);
  const [fotoUrlInput, setFotoUrlInput] = useState("");
  const [guardandoInspeccion, setGuardandoInspeccion] = useState(false);
  const [mensajeInspeccion, setMensajeInspeccion] = useState({ tipo: "", texto: "" });

  const [tecnicoNombre, setTecnicoNombre] = useState(
    reporteVisitaInicial?.medidas?.tecnicoNombre || cotizacionInicial.inspectorNombre || ""
  );
  const [fechaVisitaRealizada, setFechaVisitaRealizada] = useState(
    reporteVisitaInicial?.medidas?.fechaVisita || 
    (cotizacionInicial.fechaVisita ? new Date(cotizacionInicial.fechaVisita).toISOString().split("T")[0] : new Date().toISOString().split("T")[0])
  );
  const [horaVisitaRealizada, setHoraVisitaRealizada] = useState(
    reporteVisitaInicial?.medidas?.horaVisita || 
    (cotizacionInicial.fechaVisita ? new Date(cotizacionInicial.fechaVisita).toTimeString().split(" ")[0].slice(0, 5) : new Date().toTimeString().split(" ")[0].slice(0, 5))
  );
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const [dictandoObs, setDictandoObs] = useState(false);
  const [dictandoCond, setDictandoCond] = useState(false);
  const [rotaciones, setRotaciones] = useState<Record<string, number>>(reporteVisitaInicial?.medidas?.rotaciones || {});

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
  const [margenGlobal, setMargenGlobal] = useState<string>("20");
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

  useEffect(() => {
    async function cargarRemision() {
      try {
        setCargandoRemision(true);
        const doc = await obtenerRemisionFacturaDeCotizacion(cotizacion.id);
        setRemisionFactura(doc);
      } catch (err) {
        console.error("Error al cargar remisión/factura:", err);
      } finally {
        setCargandoRemision(false);
      }
    }
    if (cotizacion.estatus === "instalacion" || cotizacion.estatus === "aceptada") {
      cargarRemision();
    } else {
      setRemisionFactura(null);
      setCargandoRemision(false);
    }
  }, [cotizacion.id, cotizacion.estatus]);

  useEffect(() => {
    async function cargarGarantia() {
      try {
        setCargandoGarantia(true);
        const doc = await obtenerGarantiaDocumento(cotizacion.id);
        setGarantiaDoc(doc);
        if (doc) {
          setGarantiaTexto(doc.contenido);
          setGarantiaTitulo(doc.titulo);
        }
      } catch (err) {
        console.error("Error al cargar carta de garantía:", err);
      } finally {
        setCargandoGarantia(false);
      }
    }
    if (cotizacion.estatus === "instalacion" || cotizacion.estatus === "aceptada") {
      cargarGarantia();
    } else {
      setGarantiaDoc(null);
      setCargandoGarantia(false);
    }
  }, [cotizacion.id, cotizacion.estatus]);

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
      let ultimoError = "";
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("archivo", file);
        
        const res = await subirFotoVisita(formData);
        if (res && res.ok && res.url) {
          nuevasUrls.push(res.url);
        } else {
          ultimoError = res?.error || "Respuesta vacía del servidor.";
          console.error("Error al subir imagen:", ultimoError);
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
          texto: ultimoError ? `No se pudo subir ninguna imagen. Detalle: ${ultimoError}` : "No se pudo subir ninguna imagen."
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
          areaCalculada: areaVal,
          tecnicoNombre: tecnicoNombre.trim(),
          fechaVisita: fechaVisitaRealizada,
          horaVisita: horaVisitaRealizada,
          rotaciones
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

  // Memos para Totales del Presupuesto
  const totalCostoInterno = useMemo(() => {
    return conceptosEditables.reduce((acc, c) => acc + (c.cantidad * c.costoUnitario), 0);
  }, [conceptosEditables]);

  const totalPrecioVenta = useMemo(() => {
    return conceptosEditables.reduce((acc, c) => {
      const desc = c.descuento || 0;
      return acc + (c.cantidad * c.precioUnitario * (1 - desc / 100));
    }, 0);
  }, [conceptosEditables]);

  const margenTotalPresupuesto = useMemo(() => {
    if (!totalPrecioVenta) return 0;
    return Math.round(((totalPrecioVenta - totalCostoInterno) / totalPrecioVenta) * 100);
  }, [totalCostoInterno, totalPrecioVenta]);

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
          const updated = { ...c, [campo]: valor };
          if (campo === "margen") {
            const m = Math.min(99, Math.max(-1000, Number(valor)));
            updated.precioUnitario = Number((updated.costoUnitario / (1 - m / 100)).toFixed(2));
          }
          return updated;
        }
        return c;
      })
    );
  };

  const moverFilaConcepto = (index: number, direccion: "arriba" | "abajo") => {
    setConceptosEditables((prev) => {
      const list = [...prev];
      const targetIdx = direccion === "arriba" ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIdx];
      list[targetIdx] = temp;
      return list;
    });
  };

  const ordenarConceptos = (criterio: "importe" | "costo" | "precio", direccion: "asc" | "desc") => {
    setConceptosEditables((prev) => {
      const list = [...prev];
      list.sort((a, b) => {
        let valA = 0;
        let valB = 0;
        if (criterio === "importe") {
          const descA = a.descuento || 0;
          const descB = b.descuento || 0;
          valA = a.cantidad * a.precioUnitario * (1 - descA / 100);
          valB = b.cantidad * b.precioUnitario * (1 - descB / 100);
        } else if (criterio === "costo") {
          valA = a.costoUnitario;
          valB = b.costoUnitario;
        } else if (criterio === "precio") {
          valA = a.precioUnitario;
          valB = b.precioUnitario;
        }
        return direccion === "asc" ? valA - valB : valB - valA;
      });
      return list;
    });
  };

  const aplicarMargenGlobal = (m: number) => {
    if (m >= 100) return;
    setConceptosEditables((prev) =>
      prev.map((c) => {
        const nuevoPrecio = Number((c.costoUnitario / (1 - m / 100)).toFixed(2));
        return { ...c, precioUnitario: nuevoPrecio };
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

  const handleCrearRemisionFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setProcesandoRemision(true);
      setMensajeRemisionForm({ tipo: "", texto: "" });

      if (!folioDoc.trim()) {
        throw new Error("El folio del documento es obligatorio.");
      }

      const datosDoc: Record<string, any> = {};
      if (tipoDoc === "factura") {
        if (!rfcDoc.trim() || !razonSocialDoc.trim()) {
          throw new Error("RFC y Razón Social son obligatorios para facturación.");
        }
        datosDoc.rfc = rfcDoc.trim();
        datosDoc.razonSocial = razonSocialDoc.trim();
        datosDoc.regimenFiscal = regimenFiscalDoc.trim();
        datosDoc.usoCfdi = usoCfdiDoc.trim();
      } else {
        datosDoc.direccionEntrega = direccionEntregaDoc.trim();
        datosDoc.personaRecibe = personaRecibeDoc.trim();
        datosDoc.fechaInstalacion = fechaInstalacionDoc;
      }

      const res = await crearRemisionFactura(cotizacion.id, {
        tipo: tipoDoc,
        folio: folioDoc.trim(),
        fecha: fechaDoc,
        tipoCambio: parseFloat(tipoCambioDoc) || 1.0,
        datosDocumento: datosDoc,
        serviciosExtra: parseFloat(serviciosExtraDoc) || 0.0,
        costoFinanciero: parseFloat(costoFinancieroDoc) || 0.0,
        otrosGastos: parseFloat(otrosGastosDoc) || 0.0,
      });

      if (res.ok) {
        setMensajeRemisionForm({
          tipo: "ok",
          texto: `¡Documento (${tipoDoc.toUpperCase()}) generado exitosamente! La venta ha sido registrada en el balance financiero y el expediente se actualizó a la etapa de venta.`
        });
        
        // Actualizar estatus local de la cotización para reflejar la evolución
        setCotizacion(prev => ({
          ...prev,
          estatus: "instalacion"
        }));

        // Forzar recarga de datos
        router.refresh();
      } else {
        throw new Error("No se pudo completar el registro.");
      }
    } catch (err: any) {
      setMensajeRemisionForm({ tipo: "error", texto: err.message || "Ocurrió un error inesperado." });
    } finally {
      setProcesandoRemision(false);
    }
  };

  const iniciarEdicionRemision = () => {
    if (!remisionFactura) return;
    setTipoDoc(remisionFactura.tipo);
    setFolioDoc(remisionFactura.folio);
    setFechaDoc(remisionFactura.fecha);
    setTipoCambioDoc(String(remisionFactura.tipoCambio));
    setServiciosExtraDoc(String(remisionFactura.serviciosExtra));
    setCostoFinancieroDoc(String(remisionFactura.costoFinanciero));
    setOtrosGastosDoc(String(remisionFactura.otrosGastos));
    
    if (remisionFactura.tipo === "factura") {
      setRfcDoc(remisionFactura.datosDocumento.rfc || "");
      setRazonSocialDoc(remisionFactura.datosDocumento.razonSocial || "");
      setRegimenFiscalDoc(remisionFactura.datosDocumento.regimenFiscal || "");
      setUsoCfdiDoc(remisionFactura.datosDocumento.usoCfdi || "G03");
      // reset delivery inputs
      setDireccionEntregaDoc("");
      setPersonaRecibeDoc("");
      setFechaInstalacionDoc("");
    } else {
      setDireccionEntregaDoc(remisionFactura.datosDocumento.direccionEntrega || "");
      setPersonaRecibeDoc(remisionFactura.datosDocumento.personaRecibe || "");
      setFechaInstalacionDoc(remisionFactura.datosDocumento.fechaInstalacion || "");
      // reset invoice inputs
      setRfcDoc("");
      setRazonSocialDoc("");
      setRegimenFiscalDoc("");
    }
    
    setEditandoRemision(true);
    setMensajeRemisionForm({ tipo: "", texto: "" });
  };

  const handleEditarRemisionFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remisionFactura) return;
    try {
      setProcesandoRemision(true);
      setMensajeRemisionForm({ tipo: "", texto: "" });

      if (!folioDoc.trim()) {
        throw new Error("El folio del documento es obligatorio.");
      }

      const datosDoc: Record<string, any> = {};
      if (tipoDoc === "factura") {
        if (!rfcDoc.trim() || !razonSocialDoc.trim()) {
          throw new Error("RFC y Razón Social son obligatorios para facturación.");
        }
        datosDoc.rfc = rfcDoc.trim();
        datosDoc.razonSocial = razonSocialDoc.trim();
        datosDoc.regimenFiscal = regimenFiscalDoc.trim();
        datosDoc.usoCfdi = usoCfdiDoc.trim();
      } else {
        datosDoc.direccionEntrega = direccionEntregaDoc.trim();
        datosDoc.personaRecibe = personaRecibeDoc.trim();
        datosDoc.fechaInstalacion = fechaInstalacionDoc;
      }

      const res = await editarRemisionFactura(remisionFactura.id, {
        tipo: tipoDoc,
        folio: folioDoc.trim(),
        fecha: fechaDoc,
        tipoCambio: parseFloat(tipoCambioDoc) || 1.0,
        datosDocumento: datosDoc,
        serviciosExtra: parseFloat(serviciosExtraDoc) || 0.0,
        costoFinanciero: parseFloat(costoFinancieroDoc) || 0.0,
        otrosGastos: parseFloat(otrosGastosDoc) || 0.0,
      });

      if (res.ok) {
        setMensajeRemisionForm({
          tipo: "ok",
          texto: `¡Documento (${tipoDoc.toUpperCase()}) actualizado exitosamente!`
        });

        const updatedDoc = {
          ...remisionFactura,
          tipo: tipoDoc,
          folio: folioDoc.trim(),
          fecha: fechaDoc,
          tipoCambio: parseFloat(tipoCambioDoc) || 1.0,
          datosDocumento: datosDoc,
          serviciosExtra: parseFloat(serviciosExtraDoc) || 0.0,
          costoFinanciero: parseFloat(costoFinancieroDoc) || 0.0,
          otrosGastos: parseFloat(otrosGastosDoc) || 0.0,
          montoTotal: Number(cotizacion.precioFinal || 0) + (parseFloat(serviciosExtraDoc) || 0.0),
        };
        setRemisionFactura(updatedDoc);
        setEditandoRemision(false);

        router.refresh();
      } else {
        throw new Error("No se pudo completar la actualización.");
      }
    } catch (err: any) {
      setMensajeRemisionForm({ tipo: "error", texto: err.message || "Ocurrió un error inesperado." });
    } finally {
      setProcesandoRemision(false);
    }
  };

  const handleGenerarGarantiaPorDefecto = async () => {
    try {
      setGuardandoGarantia(true);
      setMensajeGarantia({ tipo: "", texto: "" });
      const def = await prepararGarantiaPorDefecto(cotizacion.id);
      setGarantiaTexto(def.contenido);
      setGarantiaTitulo(def.titulo);
      setEditandoGarantia(true);
    } catch (err: any) {
      setMensajeGarantia({ tipo: "error", texto: err.message || "No se pudo generar la plantilla por defecto." });
    } finally {
      setGuardandoGarantia(false);
    }
  };

  const handleGuardarGarantia = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardandoGarantia(true);
      setMensajeGarantia({ tipo: "", texto: "" });

      if (!garantiaTexto.trim()) {
        throw new Error("El contenido de la garantía no puede estar vacío.");
      }

      const res = await guardarGarantiaDocumento(
        cotizacion.id,
        remisionFactura?.id || null,
        garantiaTitulo.trim() || "Carta de Garantía",
        garantiaTexto
      );

      if (res.ok) {
        setMensajeGarantia({
          tipo: "ok",
          texto: "Carta de Garantía guardada exitosamente ✓"
        });
        setEditandoGarantia(false);
        // Recargar
        const doc = await obtenerGarantiaDocumento(cotizacion.id);
        setGarantiaDoc(doc);
      }
    } catch (err: any) {
      setMensajeGarantia({ tipo: "error", texto: err.message || "Error al guardar la garantía." });
    } finally {
      setGuardandoGarantia(false);
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
        {(cotizacion.estatus === "aceptada" || cotizacion.estatus === "instalacion") && (
          <button
            onClick={() => setPestaña("facturacion")}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition border-b-2 -mb-[2px] ${
              pestaña === "facturacion" ? "border-sauce text-sauce bg-white" : "border-transparent text-carbon/60 hover:text-carbon"
            }`}
          >
            Facturación & Ventas
          </button>
        )}
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
                    <tr className="border-b">
                      <td className="py-2 text-carbon/50">Prospecto Vinculado</td>
                      <td className="py-2 font-mono">
                        {cotizacion.prospectoId ? (
                          <Link
                            href={`/prospectos/${cotizacion.prospectoId}`}
                            className="font-bold text-sauce hover:underline inline-flex items-center gap-1"
                          >
                            <span>👤 {cotizacion.prospectoId}</span>
                            <span className="text-xs font-normal text-sauce/80">(Ver prospecto →)</span>
                          </Link>
                        ) : (
                          <span className="italic text-carbon/40">Sin prospecto asignado</span>
                        )}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 text-carbon/50">Expediente Vinculado</td>
                      <td className="py-2 font-mono">
                        {cotizacion.expedienteId ? (
                          <Link
                            href={`/expediente/${cotizacion.expedienteId}`}
                            className="font-bold text-sauce hover:underline inline-flex items-center gap-1"
                          >
                            <span>📁 {cotizacion.expedienteId}</span>
                            <span className="text-xs font-normal text-sauce/80">(Ver expediente →)</span>
                          </Link>
                        ) : (
                          <span className="italic text-carbon/40">Sin expediente asignado</span>
                        )}
                      </td>
                    </tr>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
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
                        <div key={idx} className="relative rounded-lg border overflow-hidden aspect-video bg-slate-900 group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={f} 
                            alt={`Levantamiento ${idx + 1}`} 
                            className="object-contain w-full h-full transition-transform duration-200" 
                            style={{ transform: `rotate(${rotaciones[f] || 0}deg)` }}
                          />
                          <button
                            type="button"
                            onClick={() => eliminarFoto(idx)}
                            className="absolute top-1 right-1 h-6 w-6 bg-rojo/90 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow-sm z-10"
                            title="Eliminar foto"
                          >
                            ✕
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const currentAngle = rotaciones[f] || 0;
                              const nextAngle = (currentAngle + 90) % 360;
                              setRotaciones(prev => ({ ...prev, [f]: nextAngle }));
                            }}
                            className="absolute bottom-1 right-1 h-6 w-6 bg-verde-profundo/90 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow-sm z-10"
                            title="Rotar foto 90°"
                          >
                            🔄
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
                  <div className="space-y-4">
                    {/* Barra de herramientas: Margen Global y Ordenación */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-crema/20 rounded-xl border border-carbon/10 text-xs">
                      {/* Margen Global (Solo para quienes ven costos) */}
                      {(!esOperaciones || esAdmin) ? (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-carbon/70">Margen Global:</span>
                          <div className="flex items-center">
                            <input
                              type="number"
                              value={margenGlobal}
                              onChange={(e) => setMargenGlobal(e.target.value)}
                              className="w-12 rounded border border-carbon/15 px-1.5 py-1 text-center focus:border-sauce focus:outline-none bg-white font-mono"
                              placeholder="20"
                            />
                            <span className="text-carbon/50 ml-1 mr-2">%</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const m = parseFloat(margenGlobal);
                              if (!isNaN(m) && m < 100) {
                                aplicarMargenGlobal(m);
                              }
                            }}
                            className="rounded bg-sauce/15 text-sauce hover:bg-sauce hover:text-white px-2.5 py-1 font-semibold transition"
                          >
                            ⚡ Aplicar a Todo
                          </button>
                        </div>
                      ) : (
                        <div></div>
                      )}

                      {/* Ordenación (Para todos) */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-carbon/70 mr-1">Ordenar:</span>
                        <button
                          type="button"
                          onClick={() => ordenarConceptos("importe", "desc")}
                          className="rounded bg-white border border-carbon/10 hover:border-sauce px-2.5 py-1 font-medium transition text-carbon/70 hover:text-sauce hover:bg-slate-50"
                          title="Ordenar por importe de mayor a menor"
                        >
                          💰 Importe (Mayor)
                        </button>
                        <button
                          type="button"
                          onClick={() => ordenarConceptos("importe", "asc")}
                          className="rounded bg-white border border-carbon/10 hover:border-sauce px-2.5 py-1 font-medium transition text-carbon/70 hover:text-sauce hover:bg-slate-50"
                          title="Ordenar por importe de menor a mayor"
                        >
                          💰 Importe (Menor)
                        </button>
                        {(!esOperaciones || esAdmin) && (
                          <button
                            type="button"
                            onClick={() => ordenarConceptos("costo", "desc")}
                            className="rounded bg-white border border-carbon/10 hover:border-sauce px-2.5 py-1 font-medium transition text-carbon/70 hover:text-sauce hover:bg-slate-50"
                            title="Ordenar por costo unitario de mayor a menor"
                          >
                            🛠️ Costo (Mayor)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => ordenarConceptos("precio", "desc")}
                          className="rounded bg-white border border-carbon/10 hover:border-sauce px-2.5 py-1 font-medium transition text-carbon/70 hover:text-sauce hover:bg-slate-50"
                          title="Ordenar por precio unitario de mayor a menor"
                        >
                          🏷️ Precio (Mayor)
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs min-w-[750px]">
                        <thead>
                          <tr className="border-b border-carbon/10 text-carbon/40 font-semibold uppercase tracking-wider">
                            <th className="pb-2 w-[30%]">Descripción del Concepto</th>
                            <th className="pb-2 text-center w-[6%]">Cant.</th>
                            <th className="pb-2 text-center w-[7%]">Unidad</th>
                            {(!esOperaciones || esAdmin) && <th className="pb-2 text-right w-[10%]">Costo Int. Unit.</th>}
                            {(!esOperaciones || esAdmin) && <th className="pb-2 text-center w-[8%]">Margen</th>}
                            <th className="pb-2 text-right w-[10%]">Precio Unit.</th>
                            <th className="pb-2 text-center w-[8%]">Desc. %</th>
                            <th className="pb-2 text-right w-[11%]">Importe</th>
                            <th className="pb-2 text-center w-[10%]"></th>
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
                              {(!esOperaciones || esAdmin) && (
                                <td className="py-2.5 text-center">
                                  <div className="flex items-center justify-center gap-0.5">
                                    <input
                                      type="number"
                                      step="1"
                                      value={c.precioUnitario ? Math.round(((c.precioUnitario - c.costoUnitario) / c.precioUnitario) * 100) : 0}
                                      onChange={(e) => actualizarFilaConcepto(idx, "margen", Number(e.target.value))}
                                      className="w-12 rounded border border-carbon/15 px-1 py-1 text-center focus:border-sauce focus:outline-none font-mono"
                                    />
                                    <span className="text-carbon/40">%</span>
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
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => moverFilaConcepto(idx, "arriba")}
                                    className="text-carbon/40 hover:text-sauce hover:scale-110 disabled:opacity-30 disabled:hover:text-carbon/40 transition text-sm p-0.5"
                                    title="Subir"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === conceptosEditables.length - 1}
                                    onClick={() => moverFilaConcepto(idx, "abajo")}
                                    className="text-carbon/40 hover:text-sauce hover:scale-110 disabled:opacity-30 disabled:hover:text-carbon/40 transition text-sm p-0.5"
                                    title="Bajar"
                                  >
                                    ▼
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => eliminarFilaConcepto(idx)}
                                    className="text-rojo hover:text-rose-800 hover:scale-110 transition text-sm p-1 ml-1"
                                    title="Eliminar concepto"
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-carbon/15 font-semibold text-carbon/80 bg-slate-50/80">
                            <td className="py-3 px-2 font-bold" colSpan={3}>
                              Total Presupuesto
                            </td>
                            {(!esOperaciones || esAdmin) && (
                              <td className="py-3 px-2 text-right font-mono text-xs text-carbon/60">
                                {formatMoneda(totalCostoInterno)}
                              </td>
                            )}
                            {(!esOperaciones || esAdmin) && (
                              <td className="py-3 px-2 text-center text-xs">
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                  margenTotalPresupuesto >= 20 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                }`}>
                                  {margenTotalPresupuesto}% marg.
                                </span>
                              </td>
                            )}
                            <td className="py-3 px-2 text-right" colSpan={3}>
                              <span className="font-mono text-sm text-verde-profundo font-bold">
                                {formatMoneda(totalPrecioVenta)}
                              </span>
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
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

        {pestaña === "facturacion" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="font-titular text-xl font-bold text-verde-profundo">Evolución Comercial de Cotización</h3>
                <p className="text-xs text-carbon/60 mt-0.5">
                  Registra y consulta la evolución de esta propuesta a Remisión de entrega o Factura fiscal.
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                cotizacion.estatus === "instalacion" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
              }`}>
                {cotizacion.estatus === "instalacion" ? "En Instalación / Venta Cerrada" : "Aceptada - Pendiente Venta"}
              </span>
            </div>

            {cargandoRemision ? (
              <div className="py-12 text-center text-sm text-carbon/50">
                Cargando datos de venta...
              </div>
            ) : (remisionFactura && !editandoRemision) ? (
              /* MODO DETALLE: MOSTRAR DOCUMENTO YA GENERADO */
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-50 border border-carbon/10 p-6 rounded-2xl space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-sauce/15 text-sauce px-2 py-0.5 rounded">
                        {remisionFactura.tipo.toUpperCase()}
                      </span>
                      <h4 className="font-titular text-2xl font-bold mt-1 text-carbon">{remisionFactura.folio}</h4>
                      <p className="text-xs text-carbon/50">Fecha de Registro: {new Date(remisionFactura.fecha).toLocaleDateString()}</p>
                      <div className="mt-3 font-titular flex gap-2">
                        <a
                          href={`/cotizacion/remision/${cotizacion.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-carbon/15 hover:bg-slate-50 text-carbon/80 px-3 py-1.5 text-xs font-semibold transition shadow-sm"
                        >
                          🖨️ Ver Remisión / Imprimir PDF
                        </a>
                        <button
                          type="button"
                          onClick={iniciarEdicionRemision}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon/80 border border-carbon/15 px-3 py-1.5 text-xs font-semibold transition shadow-sm"
                        >
                          ✏️ Editar Remisión / Factura
                        </button>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-semibold text-carbon/50 uppercase">Monto Total de Venta</div>
                      <div className="font-mono text-xl font-bold text-sauce">{formatMoneda(remisionFactura.montoTotal)}</div>
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-carbon/60">Importe de Cotización (Subtotal):</span>
                      <span className="font-semibold">{formatMoneda(remisionFactura.montoSubtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-carbon/60">Servicios Extra / Adicionales:</span>
                      <span className="font-semibold text-emerald-600">+{formatMoneda(remisionFactura.serviciosExtra)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-bold text-carbon">
                      <span>Total de Ingreso Registrado:</span>
                      <span>{formatMoneda(remisionFactura.montoTotal)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-2 text-xs">
                    <h5 className="font-semibold uppercase text-[10px] text-carbon/50">Gastos Internos del Cierre</h5>
                    <div className="flex justify-between">
                      <span className="text-carbon/60">Costo Financiero (Comisiones/Pasarela):</span>
                      <span className="font-semibold text-red-600">-{formatMoneda(remisionFactura.costoFinanciero)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-carbon/60">Otros Gastos de Venta:</span>
                      <span className="font-semibold text-red-600">-{formatMoneda(remisionFactura.otrosGastos)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-bold text-emerald-800 bg-emerald-50 p-2 rounded">
                      <span>Margen de Utilidad Neto:</span>
                      <span>{formatMoneda(remisionFactura.montoTotal - remisionFactura.costoFinanciero - remisionFactura.otrosGastos)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-carbon/10 p-6 rounded-2xl space-y-4">
                  <h4 className="font-titular text-sm font-bold text-carbon/80 border-b pb-2 uppercase tracking-wide">
                    {remisionFactura.tipo === "factura" ? "Datos Fiscales de Facturación" : "Datos de Entrega / Instalación"}
                  </h4>

                  {remisionFactura.tipo === "factura" ? (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[10px] font-semibold text-carbon/50 uppercase">Razón Social</label>
                        <div className="font-medium mt-0.5 text-carbon">{remisionFactura.datosDocumento.razonSocial}</div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-carbon/50 uppercase">RFC</label>
                        <div className="font-mono mt-0.5 text-carbon">{remisionFactura.datosDocumento.rfc}</div>
                      </div>
                      {remisionFactura.datosDocumento.regimenFiscal && (
                        <div>
                          <label className="block text-[10px] font-semibold text-carbon/50 uppercase">Régimen Fiscal</label>
                          <div className="font-medium mt-0.5 text-carbon">{remisionFactura.datosDocumento.regimenFiscal}</div>
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] font-semibold text-carbon/50 uppercase">Uso de CFDI</label>
                        <div className="font-medium mt-0.5 text-carbon">{remisionFactura.datosDocumento.usoCfdi || "G03 - Gastos en general"}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-[10px] font-semibold text-carbon/50 uppercase">Dirección de Entrega</label>
                        <div className="font-medium mt-0.5 text-carbon">{remisionFactura.datosDocumento.direccionEntrega || "No especificada"}</div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-carbon/50 uppercase">Persona que Recibe</label>
                        <div className="font-medium mt-0.5 text-carbon">{remisionFactura.datosDocumento.personaRecibe || "No especificada"}</div>
                      </div>
                      {remisionFactura.datosDocumento.fechaInstalacion && (
                        <div>
                          <label className="block text-[10px] font-semibold text-carbon/50 uppercase">Fecha Programada de Instalación</label>
                          <div className="font-semibold text-sauce mt-0.5">{new Date(remisionFactura.datosDocumento.fechaInstalacion).toLocaleDateString()}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {remisionFactura.tipoCambio !== 1 && (
                    <div className="bg-slate-50 p-3 rounded-lg border text-xs">
                      <span className="text-carbon/60">Tipo de Cambio Aplicado: </span>
                      <span className="font-mono font-semibold">{remisionFactura.tipoCambio.toFixed(4)} MXN</span>
                    </div>
                  )}

                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1.5">✓ Venta Procesada y Sincronizada</div>
                    <div>Este expediente comercial ha sido cerrado y las transacciones de ingreso/egresos correspondientes se encuentran registradas en la base de datos de balance general.</div>
                  </div>
                </div>
              </div>

              {/* CARTA DE GARANTÍA */}
              <div className="border-t pt-6 mt-6 space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-titular text-lg font-bold text-verde-profundo uppercase tracking-wide">
                    📜 Carta de Garantía del Cliente
                  </h4>
                  {garantiaDoc && !editandoGarantia && (
                    <div className="flex gap-2 font-titular">
                      <button
                        onClick={() => setEditandoGarantia(true)}
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon/80 border px-3 py-1.5 text-xs font-semibold transition"
                      >
                        ✏️ Editar Contenido
                      </button>
                      <a
                        href={`/cotizacion/garantia/${cotizacion.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-sauce text-white px-4 py-1.5 text-xs font-semibold hover:bg-verde-profundo transition shadow-sm flex items-center gap-1.5"
                      >
                        🖨️ Imprimir / Guardar PDF
                      </a>
                    </div>
                  )}
                </div>

                {mensajeGarantia.texto && (
                  <div className={`p-4 rounded-xl text-xs border ${
                    mensajeGarantia.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
                  }`}>
                    {mensajeGarantia.texto}
                  </div>
                )}

                {editandoGarantia ? (
                  /* FORMULARIO DE EDICIÓN O CREACIÓN */
                  <form onSubmit={handleGuardarGarantia} className="space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Título del Documento</label>
                        <input
                          type="text"
                          required
                          value={garantiaTitulo}
                          onChange={(e) => setGarantiaTitulo(e.target.value)}
                          className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce font-semibold font-titular"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-carbon/60 uppercase mb-1">Contenido de la Carta de Garantía</label>
                        <textarea
                          rows={16}
                          required
                          value={garantiaTexto}
                          onChange={(e) => setGarantiaTexto(e.target.value)}
                          className="w-full rounded-lg border border-carbon/20 px-4 py-3 text-xs bg-white focus:outline-none focus:border-sauce font-mono resize-none leading-relaxed"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end font-titular">
                      <button
                        type="button"
                        onClick={() => {
                          setEditandoGarantia(false);
                          if (garantiaDoc) {
                            setGarantiaTexto(garantiaDoc.contenido);
                            setGarantiaTitulo(garantiaDoc.titulo);
                          }
                        }}
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 text-carbon/80 border px-4 py-2 text-xs font-semibold transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={guardandoGarantia}
                        className="rounded-lg bg-sauce text-white px-5 py-2 text-xs font-semibold hover:bg-verde-profundo transition shadow-sm"
                      >
                        {guardandoGarantia ? "Guardando..." : "Guardar Garantía"}
                      </button>
                    </div>
                  </form>
                ) : garantiaDoc ? (
                  /* VISTA DE DOCUMENTO GUARDADO */
                  <div className="bg-slate-50 border border-carbon/10 p-6 rounded-2xl">
                    <h5 className="font-titular font-bold text-sm text-carbon/85 border-b pb-2 mb-4">{garantiaTitulo}</h5>
                    <pre className="text-xs text-carbon/80 whitespace-pre-wrap font-mono leading-relaxed bg-white p-4 rounded-xl border border-carbon/5 max-h-[400px] overflow-y-auto">
                      {garantiaTexto}
                    </pre>
                    <div className="mt-4 flex gap-2 pt-2 border-t text-[10px] text-carbon/50">
                      <span>Registrado el {new Date(garantiaDoc.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>Última actualización: {new Date(garantiaDoc.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  /* COMPILACIÓN INICIAL */
                  <div className="bg-slate-50 border border-carbon/10 p-8 rounded-2xl text-center space-y-4">
                    <div className="text-3xl">📜</div>
                    <div>
                      <h5 className="font-titular font-bold text-sm text-carbon">Sin Carta de Garantía registrada</h5>
                      <p className="text-xs text-carbon/50 mt-1 max-w-md mx-auto">
                        Genera y personaliza la carta de garantía correspondiente a los trabajos de esta obra para compartirla con el cliente.
                      </p>
                    </div>
                    <button
                      onClick={handleGenerarGarantiaPorDefecto}
                      disabled={guardandoGarantia}
                      className="rounded-lg bg-sauce/15 text-sauce border border-sauce/20 px-5 py-2 text-xs font-semibold hover:bg-sauce hover:text-white transition shadow-sm inline-flex items-center gap-1.5 font-titular"
                    >
                      {guardandoGarantia ? "Generando..." : "✨ Generar Carta de Garantía"}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
              /* MODO CREACIÓN / EDICIÓN: FORMULARIO PARA CREAR/EDITAR REMISIÓN / FACTURA */
              <form onSubmit={editandoRemision ? handleEditarRemisionFactura : handleCrearRemisionFactura} className="space-y-6">
                {mensajeRemisionForm.texto && (
                  <div className={`p-4 rounded-xl text-xs border ${
                    mensajeRemisionForm.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
                  }`}>
                    {mensajeRemisionForm.texto}
                  </div>
                )}

                <div className="bg-slate-50 p-5 rounded-2xl border border-carbon/10 space-y-4">
                  <h4 className="font-titular text-sm font-bold text-carbon/80 border-b pb-2 uppercase tracking-wide">
                    Configuración del Documento {editandoRemision ? "(Editar)" : "(Crear)"}
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Tipo de Evolución</label>
                      <select
                        value={tipoDoc}
                        onChange={(e) => setTipoDoc(e.target.value as "remision" | "factura")}
                        className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce"
                      >
                        <option value="remision">Remisión (Entrega)</option>
                        <option value="factura">Factura Fiscal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Folio del Documento</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: REM-001"
                        value={folioDoc}
                        onChange={(e) => setFolioDoc(e.target.value)}
                        className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Fecha del Documento</label>
                      <input
                        type="date"
                        required
                        value={fechaDoc}
                        onChange={(e) => setFechaDoc(e.target.value)}
                        className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Desglose Financiero */}
                  <div className="bg-white border border-carbon/10 p-5 rounded-2xl space-y-4">
                    <h4 className="font-titular text-sm font-bold text-carbon/80 border-b pb-2 uppercase tracking-wide">Desglose Financiero</h4>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-carbon/60 uppercase mb-1">Subtotal Base (Precio Cotización)</label>
                        <div className="w-full bg-slate-100 rounded-lg border px-3 py-2 text-xs text-carbon/60 font-mono">
                          {formatMoneda(cotizacion.precioFinal)}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Servicios Extra (+)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={serviciosExtraDoc}
                            onChange={(e) => setServiciosExtraDoc(e.target.value)}
                            className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Tipo de Cambio</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={tipoCambioDoc}
                            onChange={(e) => setTipoCambioDoc(e.target.value)}
                            className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 border-t pt-3">
                        <div>
                          <label className="block text-xs font-bold text-red-700/80 uppercase mb-1">Costo Financiero (Pasarela)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={costoFinancieroDoc}
                            onChange={(e) => setCostoFinancieroDoc(e.target.value)}
                            className="w-full rounded-lg border border-red-200 px-3 py-2 text-xs bg-white focus:outline-none focus:border-red-500 font-mono text-red-700"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-red-700/80 uppercase mb-1">Otros Gastos Internos</label>
                          <input
                            type="number"
                            step="0.01"
                            value={otrosGastosDoc}
                            onChange={(e) => setOtrosGastosDoc(e.target.value)}
                            className="w-full rounded-lg border border-red-200 px-3 py-2 text-xs bg-white focus:outline-none focus:border-red-500 font-mono text-red-700"
                          />
                        </div>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex justify-between items-center mt-4">
                        <span className="text-xs font-bold text-emerald-800">Total Ingreso Registrado:</span>
                        <span className="font-mono text-lg font-bold text-emerald-800">
                          {formatMoneda(cotizacion.precioFinal + (parseFloat(serviciosExtraDoc) || 0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Detalles dinámicos según Tipo */}
                  <div className="bg-white border border-carbon/10 p-5 rounded-2xl space-y-4">
                    <h4 className="font-titular text-sm font-bold text-carbon/80 border-b pb-2 uppercase tracking-wide">
                      {tipoDoc === "factura" ? "Detalles del Receptor Fiscal" : "Detalles de Entrega & Programación"}
                    </h4>

                    {tipoDoc === "factura" ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Razón Social</label>
                          <input
                            type="text"
                            required
                            placeholder="Ej: Sauceda Soluciones Inmobiliarias S.A. de C.V."
                            value={razonSocialDoc}
                            onChange={(e) => setRazonSocialDoc(e.target.value)}
                            className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">RFC</label>
                          <input
                            type="text"
                            required
                            placeholder="Ej: SSI150428AA1"
                            value={rfcDoc}
                            onChange={(e) => setRfcDoc(e.target.value)}
                            className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce font-mono uppercase"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Régimen Fiscal</label>
                            <input
                              type="text"
                              placeholder="Ej: 601 - General"
                              value={regimenFiscalDoc}
                              onChange={(e) => setRegimenFiscalDoc(e.target.value)}
                              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Uso de CFDI</label>
                            <select
                              value={usoCfdiDoc}
                              onChange={(e) => setUsoCfdiDoc(e.target.value)}
                              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce"
                            >
                              <option value="G03">G03 - Gastos en general</option>
                              <option value="I01">I01 - Construcciones</option>
                              <option value="S01">S01 - Sin efectos fiscales</option>
                              <option value="CP01">CP01 - Pagos</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Dirección de Entrega / Servicio</label>
                          <textarea
                            rows={2}
                            placeholder="Dirección completa donde se realizará la instalación"
                            value={direccionEntregaDoc}
                            onChange={(e) => setDireccionEntregaDoc(e.target.value)}
                            className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce resize-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Persona que Recibe / Contacto</label>
                          <input
                            type="text"
                            placeholder="Nombre del cliente o encargado en sitio"
                            value={personaRecibeDoc}
                            onChange={(e) => setPersonaRecibeDoc(e.target.value)}
                            className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-carbon/70 uppercase mb-1">Fecha Programada de Instalación</label>
                          <input
                            type="date"
                            value={fechaInstalacionDoc}
                            onChange={(e) => setFechaInstalacionDoc(e.target.value)}
                            className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-xs bg-white focus:outline-none focus:border-sauce"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  {editandoRemision && (
                    <button
                      type="button"
                      onClick={() => setEditandoRemision(false)}
                      className="rounded-xl border border-carbon/20 bg-white hover:bg-slate-50 text-carbon/70 px-6 py-3 text-sm font-semibold transition"
                    >
                      Cancelar Edición
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={procesandoRemision}
                    className="rounded-xl bg-sauce hover:bg-verde-profundo text-white px-6 py-3 text-sm font-semibold transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {procesandoRemision ? (
                      <>{editandoRemision ? "Guardando..." : "Procesando Cierre..."}</>
                    ) : (
                      <>{editandoRemision ? "💾 Guardar Cambios" : "⚡ Generar y Registrar Cierre Financiero"}</>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
