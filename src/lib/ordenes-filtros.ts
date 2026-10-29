export interface OpcionFiltro {
  value: string;
  label: string;
  grupo?: "Sauceda Construye" | "Bienes Raíces" | "Otro";
  icono?: string;
}

export const OPCIONES_ESTATUS_OT: { value: string; label: string; icono: string }[] = [
  { value: "en_proceso", label: "En Proceso", icono: "⚙️" },
  { value: "pendiente", label: "Pendiente", icono: "⏳" },
  { value: "completada", label: "Completada", icono: "✓" },
  { value: "cancelada", label: "Cancelada", icono: "✕" },
];

export const OPCIONES_LINEAS_NEGOCIO: OpcionFiltro[] = [
  // Sauceda Construye
  { value: "construccion", label: "Construcción General", grupo: "Sauceda Construye", icono: "🏗️" },
  { value: "construccion-impermeabilizacion", label: "Impermeabilización", grupo: "Sauceda Construye", icono: "☔" },
  { value: "construccion-mantenimiento-cisternas", label: "Cisternas y Aljibes", grupo: "Sauceda Construye", icono: "💧" },
  { value: "construccion-remodelacion", label: "Remodelación", grupo: "Sauceda Construye", icono: "🔨" },
  { value: "construccion-piso-estampado", label: "Piso Estampado", grupo: "Sauceda Construye", icono: "🧱" },
  { value: "construccion-mantenimiento-calentadores", label: "Calentadores Solares", grupo: "Sauceda Construye", icono: "☀️" },
  { value: "construccion-mantenimiento-tinacos", label: "Mantenimiento Tinacos", grupo: "Sauceda Construye", icono: "🚰" },
  { value: "construccion-herreria", label: "Herrería", grupo: "Sauceda Construye", icono: "⚙️" },
  { value: "seguridad", label: "Seguridad / CCTV", grupo: "Sauceda Construye", icono: "🛡️" },
  { value: "construccion-mantenimiento-postventa", label: "Mantenimiento Postventa", grupo: "Sauceda Construye", icono: "🔧" },

  // Bienes Raíces
  { value: "asesoria_compra", label: "Asesoría de Compra", grupo: "Bienes Raíces", icono: "🔑" },
  { value: "solo_tramite", label: "Solo Trámite (Gestión Crédito)", grupo: "Bienes Raíces", icono: "📄" },
  { value: "traspaso_compra", label: "Traspaso / Compra", grupo: "Bienes Raíces", icono: "🏠" },
  { value: "promocion_venta", label: "Promoción Venta", grupo: "Bienes Raíces", icono: "📣" },

  // Otro
  { value: "otro", label: "Otro", grupo: "Otro", icono: "📁" },
];

export const VALORES_CONSTRUCCION: string[] = OPCIONES_LINEAS_NEGOCIO
  .filter((o) => o.grupo === "Sauceda Construye")
  .map((o) => o.value);

export const VALORES_BIENES_RAICES: string[] = OPCIONES_LINEAS_NEGOCIO
  .filter((o) => o.grupo === "Bienes Raíces")
  .map((o) => o.value);

export const TODOS_LOS_VALORES_LINEAS: string[] = OPCIONES_LINEAS_NEGOCIO.map((o) => o.value);

export const TODOS_LOS_ESTATUS: string[] = OPCIONES_ESTATUS_OT.map((o) => o.value);

/**
 * Expande tipos y sinónimos para asegurar compatibilidad con valores históricos
 * en la base de datos (p. ej. 'impermeabilizacion' vs 'construccion-impermeabilizacion').
 */
export function expandirTiposNegocio(tipos: string[]): string[] {
  const resultado = new Set<string>();

  for (const t of tipos) {
    if (!t || t === "todos") continue;

    if (t === "construccion_todas" || t === "construccion" || t === "sauceda_construye") {
      [
        "construccion",
        "construccion-impermeabilizacion",
        "impermeabilizacion",
        "construccion-mantenimiento-cisternas",
        "mantenimiento_cisternas",
        "construccion-remodelacion",
        "remodelacion",
        "construccion-piso-estampado",
        "piso_estampado",
        "construccion-mantenimiento-calentadores",
        "construccion-mantenimiento-tinacos",
        "construccion-herreria",
        "herreria",
        "seguridad",
        "construccion-mantenimiento-postventa",
      ].forEach((x) => resultado.add(x));
    } else if (t === "bienes_raices" || t === "bienes_raices_todas") {
      [
        "asesoria_compra",
        "solo_tramite",
        "traspaso_compra",
        "promocion_venta",
      ].forEach((x) => resultado.add(x));
    } else if (t === "impermeabilizacion" || t === "construccion-impermeabilizacion") {
      resultado.add("impermeabilizacion");
      resultado.add("construccion-impermeabilizacion");
    } else if (t === "mantenimiento_cisternas" || t === "construccion-mantenimiento-cisternas") {
      resultado.add("mantenimiento_cisternas");
      resultado.add("construccion-mantenimiento-cisternas");
    } else if (t === "piso_estampado" || t === "construccion-piso-estampado") {
      resultado.add("piso_estampado");
      resultado.add("construccion-piso-estampado");
    } else if (t === "herreria" || t === "construccion-herreria") {
      resultado.add("herreria");
      resultado.add("construccion-herreria");
    } else if (t === "remodelacion" || t === "construccion-remodelacion") {
      resultado.add("remodelacion");
      resultado.add("construccion-remodelacion");
    } else {
      resultado.add(t);
    }
  }

  return Array.from(resultado);
}

/**
 * Revisa si un tipo de negocio pertenece al conjunto seleccionado
 */
export function tipoCoincideConSeleccion(tipoOrden: string | null | undefined, seleccionados: string[]): boolean {
  if (!seleccionados || seleccionados.length === 0) return true;
  if (seleccionados.length >= TODOS_LOS_VALORES_LINEAS.length) return true;
  const expandidos = expandirTiposNegocio(seleccionados);
  return expandidos.includes(tipoOrden || "");
}

export interface EstadoFiltrosOT {
  estatuses: string[];
  lineas: string[];
  asesores: string[];
  busqueda: string;
}

export const FILTROS_OT_DEFAULT: EstadoFiltrosOT = {
  estatuses: ["en_proceso"],
  lineas: VALORES_CONSTRUCCION,
  asesores: [],
  busqueda: "",
};

export const STORAGE_KEY_FILTROS_OT = "sauceda_ot_filtros_v2";

/**
 * Lee los filtros de URL o LocalStorage o devuelve los de fábrica (Solo Construcción)
 */
export function parsearFiltrosIniciales(): EstadoFiltrosOT {
  if (typeof window === "undefined") {
    return FILTROS_OT_DEFAULT;
  }

  // 1. Revisar URLSearchParams
  const urlParams = new URLSearchParams(window.location.search);
  const tieneParams =
    urlParams.has("lineas") || urlParams.has("estatus") || urlParams.has("asesor") || urlParams.has("q");

  if (tieneParams) {
    const rawLineas = urlParams.get("lineas");
    const rawEstatus = urlParams.get("estatus");
    const rawAsesor = urlParams.get("asesor");
    const rawQ = urlParams.get("q");

    let lineas: string[];
    if (!rawLineas || rawLineas === "construccion" || rawLineas === "construccion_todas") {
      lineas = VALORES_CONSTRUCCION;
    } else if (rawLineas === "bienes_raices") {
      lineas = VALORES_BIENES_RAICES;
    } else if (rawLineas === "todas") {
      lineas = TODOS_LOS_VALORES_LINEAS;
    } else {
      lineas = rawLineas.split(",").filter(Boolean);
    }

    return {
      lineas: lineas.length > 0 ? lineas : VALORES_CONSTRUCCION,
      estatuses: rawEstatus ? rawEstatus.split(",").filter(Boolean) : ["en_proceso"],
      asesores: rawAsesor ? rawAsesor.split(",").filter(Boolean) : [],
      busqueda: rawQ || "",
    };
  }

  // 2. Revisar LocalStorage
  try {
    const guardado = localStorage.getItem(STORAGE_KEY_FILTROS_OT);
    if (guardado) {
      const parsed = JSON.parse(guardado);
      if (parsed && Array.isArray(parsed.lineas) && Array.isArray(parsed.estatuses)) {
        return {
          lineas: parsed.lineas.length > 0 ? parsed.lineas : VALORES_CONSTRUCCION,
          estatuses: parsed.estatuses.length > 0 ? parsed.estatuses : ["en_proceso"],
          asesores: Array.isArray(parsed.asesores) ? parsed.asesores : [],
          busqueda: typeof parsed.busqueda === "string" ? parsed.busqueda : "",
        };
      }
    }
  } catch (e) {
    console.warn("[FiltrosOT] Error leyendo localStorage:", e);
  }

  // 3. Predeterminado: Solo Construcción + En Proceso
  return FILTROS_OT_DEFAULT;
}

/**
 * Guarda los filtros en LocalStorage y sincroniza la URL sin refrescar la página
 */
export function persistirFiltrosOT(filtros: EstadoFiltrosOT) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY_FILTROS_OT, JSON.stringify(filtros));
  } catch (e) {
    console.warn("[FiltrosOT] Error guardando en localStorage:", e);
  }

  try {
    const params = new URLSearchParams();

    // Lineas
    const sonTodasConstruccion =
      filtros.lineas.length === VALORES_CONSTRUCCION.length &&
      VALORES_CONSTRUCCION.every((v) => filtros.lineas.includes(v));

    const sonTodasBienesRaices =
      filtros.lineas.length === VALORES_BIENES_RAICES.length &&
      VALORES_BIENES_RAICES.every((v) => filtros.lineas.includes(v));

    const sonTodas = filtros.lineas.length >= TODOS_LOS_VALORES_LINEAS.length;

    if (sonTodasConstruccion) {
      params.set("lineas", "construccion");
    } else if (sonTodasBienesRaices) {
      params.set("lineas", "bienes_raices");
    } else if (sonTodas) {
      params.set("lineas", "todas");
    } else if (filtros.lineas.length > 0) {
      params.set("lineas", filtros.lineas.join(","));
    }

    // Estatus
    if (filtros.estatuses.length > 0 && filtros.estatuses.length < TODOS_LOS_ESTATUS.length) {
      params.set("estatus", filtros.estatuses.join(","));
    }

    // Asesores
    if (filtros.asesores.length > 0) {
      params.set("asesor", filtros.asesores.join(","));
    }

    // Búsqueda
    if (filtros.busqueda.trim()) {
      params.set("q", filtros.busqueda.trim());
    }

    const qs = params.toString();
    const nuevaUrl = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState(null, "", nuevaUrl);
  } catch (e) {
    console.warn("[FiltrosOT] Error sincronizando URL:", e);
  }
}
