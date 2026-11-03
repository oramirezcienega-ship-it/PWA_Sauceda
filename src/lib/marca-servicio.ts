/**
 * Identificación de Marca y Línea de Negocio para Documentos y Formatos:
 * - Sauceda Protege: Equipos de seguridad, CCTV, cámaras, alarmas, videoporteros, interfones, control de acceso.
 * - Sauceda Construye: Impermeabilización, remodelación, losas, pintura, pisos estampados, herrería y mantenimiento.
 */

export interface InfoMarcaServicio {
  esSeguridad: boolean;
  nombre: "Sauceda Protege" | "Sauceda Construye";
  nombreMayus: "SAUCEDA PROTEGE" | "SAUCEDA CONSTRUYE";
  descriptor: string;
  lema: string;
  pieDocumento: string;
  servicioLabel: string;
  portalAprobacionTexto: string;
}

const REGEX_SEGURIDAD =
  /\b(?:seguridad|segur|c[aá]mara|c[aá]maras|cctv|videovigilancia|control\s+de\s+acceso|dvr|nvr|alarma|alarmas|dahua|hikvision|airshield|powerseries|videoportero|videoporteros|interf[oó]n|interfones|contrachapa|cerco\s+el[eé]ctrico|monitoreo\s+central|cat-0(?:1[0-9]|2[0-2]))\b/i;

/**
 * Determina si una entidad (cotización, orden de trabajo, servicio, producto o texto)
 * pertenece a la vertical de Seguridad Electrónica (Sauceda Protege).
 */
export function esServicioSeguridad(origen?: any): boolean {
  if (!origen) return false;

  // Si es string directo (ej. tipo_negocio o título)
  if (typeof origen === "string") {
    const s = origen.trim();
    if (s.toLowerCase() === "seguridad") return true;
    return REGEX_SEGURIDAD.test(s);
  }

  // Tipo de negocio del expediente, orden o prospecto
  const tipoNeg = String(origen.tipo_negocio || origen.tipoNegocio || "").toLowerCase();
  if (tipoNeg === "seguridad" || tipoNeg.includes("segur")) return true;

  // Tipo de servicio en cotizaciones
  const servTipo = String(origen.servicio_tipo || origen.servicioTipo || "").toLowerCase();
  if (servTipo === "seguridad" || servTipo.includes("segur")) return true;

  // Datos modulares (combos de seguridad, Dahua, Hikvision, etc.)
  const dm = origen.datos_modulares || origen.datosModulares;
  if (dm) {
    if (dm.propuesta_principal || dm.servicio_recurrente) return true;
    const dmTit = String(dm.titulo || "");
    if (REGEX_SEGURIDAD.test(dmTit)) return true;
    if (dm.etiquetas && String(dm.etiquetas).toLowerCase().includes("segur")) return true;
  }

  // Título o descripción o texto libre
  const tit = String(origen.titulo || origen.nombre || "");
  if (REGEX_SEGURIDAD.test(tit)) return true;

  const desc = String(origen.descripcion || origen.necesidad || origen.texto || origen.categoria || origen.codigo || "");
  if (REGEX_SEGURIDAD.test(desc)) return true;

  // Productos asociados
  if (Array.isArray(origen.productos)) {
    const tieneProd = origen.productos.some((p: any) => {
      const d = String(p?.titulo || p?.nombre || p?.descripcion || p?.id || "");
      return REGEX_SEGURIDAD.test(d);
    });
    if (tieneProd) return true;
  }

  // Conceptos individuales de la cotización
  if (Array.isArray(origen.conceptos)) {
    const tieneConceptoSeguridad = origen.conceptos.some((c: any) => {
      const d = String(c?.descripcion || c?.nombre || "");
      return REGEX_SEGURIDAD.test(d);
    });
    if (tieneConceptoSeguridad) return true;
  }

  return false;
}

/**
 * Retorna la información de identidad corporativa correcta (Sauceda Protege vs Sauceda Construye)
 * para membretes, encabezados, pies de página, títulos y firmas en todos los formatos.
 */
export function obtenerMarcaServicio(origen?: any): InfoMarcaServicio {
  const seguridad = esServicioSeguridad(origen);

  if (seguridad) {
    return {
      esSeguridad: true,
      nombre: "Sauceda Protege",
      nombreMayus: "SAUCEDA PROTEGE",
      descriptor: "Sauceda Protege · Seguridad Electrónica y CCTV · León, Gto.",
      lema: "Tu tranquilidad en manos expertas",
      pieDocumento: "Póliza y formatos oficiales emitidos por Sauceda Protege.",
      servicioLabel: "Equipos de Seguridad",
      portalAprobacionTexto: "equipos de seguridad, videovigilancia y control de acceso",
    };
  }

  return {
    esSeguridad: false,
    nombre: "Sauceda Construye",
    nombreMayus: "SAUCEDA CONSTRUYE",
    descriptor: "Construcción · Mantenimiento · Bienes Raíces · León, Gto.",
    lema: "Tradición con tecnología",
    pieDocumento: "Documento oficial emitido por SAUCEDA Construye.",
    servicioLabel: "Servicios de Construcción",
    portalAprobacionTexto: "servicios de construcción y mantenimiento residencial",
  };
}
