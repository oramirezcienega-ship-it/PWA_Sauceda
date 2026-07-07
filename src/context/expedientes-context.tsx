"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DatosExpediente, EtapaId, Expediente } from "@/lib/types";
import * as acciones from "@/app/actions/expedientes";

/**
 * Estado de los expedientes respaldado por Supabase (Incremento 3).
 *
 * La fuente de verdad es la base de datos. Este contexto mantiene una
 * copia en memoria para la UI del admin: carga la lista al montar y, en
 * cada cambio, llama a las server actions y refleja el resultado.
 */
interface ExpedientesContextValue {
  expedientes: Expediente[];
  /** Indica si ya terminó la carga inicial. */
  cargado: boolean;
  /** Mensaje de error de carga/escritura, si lo hubo. */
  error: string | null;
  /** Vuelve a leer la lista desde la base de datos. */
  recargar: () => Promise<void>;
  /** Cambia la etapa de un expediente. */
  moverEtapa: (id: string, etapa: EtapaId) => Promise<void>;
  /** Cambia la etapa de varios expedientes a la vez. */
  moverEtapaMasivo: (ids: string[], etapa: EtapaId) => Promise<void>;
  /** Elimina varios expedientes a la vez. */
  eliminarMasivo: (ids: string[]) => Promise<void>;
  /** Crea un expediente nuevo y devuelve su id generado. */
  crearExpediente: (datos: DatosExpediente) => Promise<string>;
  /** Actualiza los datos editables de un expediente existente. */
  actualizarExpediente: (id: string, datos: DatosExpediente) => Promise<void>;
  /** Elimina un expediente. */
  eliminarExpediente: (id: string) => Promise<void>;
  /** Busca un expediente por id (en la copia en memoria). */
  obtenerExpediente: (id: string) => Expediente | undefined;
}

const ExpedientesContext = createContext<ExpedientesContextValue | null>(null);

/** Rutas públicas (sin sesión de admin): login y portal del cliente. */
function esRutaPublica(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/seguimiento") ||
    path.startsWith("/privacidad") ||
    path.startsWith("/cotizacion") ||
    path.startsWith("/agenda")
  );
}

export function ExpedientesProvider({ children }: { children: ReactNode }) {
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    // Este provider envuelve TODA la app (está en el layout raíz). En las
    // rutas públicas (login y portal del cliente) no hay panel que cargar,
    // así que no pedimos nada ni redirigimos (evita un bucle en /login).
    if (typeof window !== "undefined" && esRutaPublica(window.location.pathname)) {
      setCargado(true);
      return;
    }
    try {
      setError(null);
      const res = await acciones.cargarExpedientes();
      if (res.ok) {
        setExpedientes(res.expedientes);
      } else {
        // Sin sesión: el servidor responde "No autorizado". En vez de mostrar
        // el panel con un error, mandamos al login (refuerza al middleware).
        if (
          /no autorizado/i.test(res.mensaje) &&
          typeof window !== "undefined"
        ) {
          window.location.replace("/login");
          return;
        }
        setError(`No se pudieron cargar los expedientes. Detalle: ${res.mensaje}`);
      }
    } catch (err) {
      console.error("Error al cargar expedientes:", err);
      const detalle = err instanceof Error ? err.message : "error desconocido";
      if (/no autorizado/i.test(detalle) && typeof window !== "undefined") {
        window.location.replace("/login");
        return;
      }
      setError(
        `No se pudieron cargar los expedientes. Detalle: ${detalle}`,
      );
    } finally {
      setCargado(true);
    }
  }, []);

  // Carga inicial desde la base de datos.
  useEffect(() => {
    void recargar();
  }, [recargar]);

  const moverEtapa = useCallback(
    async (id: string, etapa: EtapaId) => {
      const hoy = new Date().toISOString().slice(0, 10);
      // Optimista: actualizamos la UI de inmediato.
      setExpedientes((prev) =>
        prev.map((exp) =>
          exp.id === id ? { ...exp, etapa, ultimoMovimiento: hoy } : exp,
        ),
      );
      try {
        await acciones.moverEtapa(id, etapa);
      } catch (err) {
        console.error("Error al mover de etapa:", err);
        await recargar(); // revertimos al estado real
      }
    },
    [recargar],
  );

  const moverEtapaMasivo = useCallback(
    async (ids: string[], etapa: EtapaId) => {
      if (ids.length === 0) return;
      const hoy = new Date().toISOString().slice(0, 10);
      // Optimista: actualizamos todas las filas seleccionadas de inmediato.
      setExpedientes((prev) =>
        prev.map((exp) =>
          ids.includes(exp.id)
            ? { ...exp, etapa, ultimoMovimiento: hoy }
            : exp,
        ),
      );
      try {
        await acciones.moverEtapaMasivo(ids, etapa);
      } catch (err) {
        console.error("Error al mover de etapa (masivo):", err);
        await recargar();
      }
    },
    [recargar],
  );

  const eliminarMasivo = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await acciones.eliminarExpedientesMasivo(ids);
      setExpedientes((prev) => prev.filter((exp) => !ids.includes(exp.id)));
    },
    [],
  );

  const crearExpediente = useCallback(
    async (datos: DatosExpediente): Promise<string> => {
      const nuevo = await acciones.crearExpediente(datos);
      setExpedientes((prev) => [...prev, nuevo]);
      return nuevo.id;
    },
    [],
  );

  const actualizarExpediente = useCallback(
    async (id: string, datos: DatosExpediente) => {
      const actualizado = await acciones.actualizarExpediente(id, datos);
      setExpedientes((prev) =>
        prev.map((exp) => (exp.id === id ? actualizado : exp)),
      );
    },
    [],
  );

  const eliminarExpediente = useCallback(async (id: string) => {
    await acciones.eliminarExpediente(id);
    setExpedientes((prev) => prev.filter((exp) => exp.id !== id));
  }, []);

  const obtenerExpediente = useCallback(
    (id: string) => expedientes.find((exp) => exp.id === id),
    [expedientes],
  );

  const value = useMemo(
    () => ({
      expedientes,
      cargado,
      error,
      recargar,
      moverEtapa,
      moverEtapaMasivo,
      eliminarMasivo,
      crearExpediente,
      actualizarExpediente,
      eliminarExpediente,
      obtenerExpediente,
    }),
    [
      expedientes,
      cargado,
      error,
      recargar,
      moverEtapa,
      moverEtapaMasivo,
      eliminarMasivo,
      crearExpediente,
      actualizarExpediente,
      eliminarExpediente,
      obtenerExpediente,
    ],
  );

  return (
    <ExpedientesContext.Provider value={value}>
      {children}
    </ExpedientesContext.Provider>
  );
}

/** Hook para consumir el estado de expedientes. */
export function useExpedientes(): ExpedientesContextValue {
  const ctx = useContext(ExpedientesContext);
  if (!ctx) {
    throw new Error(
      "useExpedientes debe usarse dentro de <ExpedientesProvider>.",
    );
  }
  return ctx;
}
