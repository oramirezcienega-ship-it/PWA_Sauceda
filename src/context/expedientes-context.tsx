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

export function ExpedientesProvider({ children }: { children: ReactNode }) {
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    try {
      setError(null);
      const lista = await acciones.listarExpedientes();
      setExpedientes(lista);
    } catch (err) {
      console.error("Error al cargar expedientes:", err);
      setError(
        "No se pudieron cargar los expedientes. Revisa la conexión con Supabase.",
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
