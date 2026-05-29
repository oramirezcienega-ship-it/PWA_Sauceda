"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DatosExpediente, EtapaId, Expediente } from "@/lib/types";
import { EXPEDIENTES_MOCK } from "@/lib/mock-data";

/**
 * Estado de los expedientes con persistencia local (Incremento 2).
 *
 * Sigue SIN backend ni base de datos: los expedientes se guardan en
 * localStorage del navegador. En la primera visita se siembran con los
 * datos mock; a partir de ahí el tablero recuerda los cambios.
 *
 * FUTURO: sustituir localStorage por la capa de datos real (API / DB)
 * manteniendo esta misma interfaz de contexto.
 */

/** Clave de almacenamiento (versionada para poder migrar más adelante). */
const STORAGE_KEY = "sauceda.expedientes.v1";

interface ExpedientesContextValue {
  expedientes: Expediente[];
  /** Indica si ya se cargó el estado persistido (evita parpadeos/guardados prematuros). */
  cargado: boolean;
  /** Cambia la etapa de un expediente y actualiza su último movimiento. */
  moverEtapa: (id: string, etapa: EtapaId) => void;
  /** Crea un expediente nuevo y devuelve su id generado. */
  crearExpediente: (datos: DatosExpediente) => string;
  /** Actualiza los datos editables de un expediente existente. */
  actualizarExpediente: (id: string, datos: DatosExpediente) => void;
  /** Elimina un expediente. */
  eliminarExpediente: (id: string) => void;
  /** Restablece el tablero a los datos de ejemplo (útil para demos). */
  restablecerMock: () => void;
  /** Busca un expediente por id. */
  obtenerExpediente: (id: string) => Expediente | undefined;
}

const ExpedientesContext = createContext<ExpedientesContextValue | null>(null);

/** Fecha de hoy en formato ISO corto (YYYY-MM-DD). */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Genera el siguiente id correlativo tipo EXP-007 a partir de la lista actual. */
function siguienteId(lista: Expediente[]): string {
  const numeros = lista
    .map((e) => parseInt(e.id.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = numeros.length ? Math.max(...numeros) : 0;
  return `EXP-${String(max + 1).padStart(3, "0")}`;
}

export function ExpedientesProvider({ children }: { children: ReactNode }) {
  // Estado inicial = mock (coincide en servidor y primer render del cliente,
  // evitando errores de hidratación). El estado real se carga en el efecto.
  const [expedientes, setExpedientes] =
    useState<Expediente[]>(EXPEDIENTES_MOCK);
  const [cargado, setCargado] = useState(false);
  // Evita que el primer guardado pise los datos antes de leer localStorage.
  const puedeGuardar = useRef(false);

  // Carga inicial desde localStorage (o siembra con los mock la primera vez).
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(STORAGE_KEY);
      if (guardado) {
        setExpedientes(JSON.parse(guardado) as Expediente[]);
      } else {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(EXPEDIENTES_MOCK),
        );
      }
    } catch (err) {
      console.error("No se pudo leer el estado persistido:", err);
    }
    puedeGuardar.current = true;
    setCargado(true);
  }, []);

  // Persiste cualquier cambio una vez que ya cargamos el estado inicial.
  useEffect(() => {
    if (!puedeGuardar.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(expedientes));
    } catch (err) {
      console.error("No se pudo guardar el estado:", err);
    }
  }, [expedientes]);

  const moverEtapa = useCallback((id: string, etapa: EtapaId) => {
    setExpedientes((prev) =>
      prev.map((exp) =>
        exp.id === id
          ? { ...exp, etapa, ultimoMovimiento: hoyISO() }
          : exp,
      ),
    );
  }, []);

  const crearExpediente = useCallback((datos: DatosExpediente): string => {
    const id = siguienteId(expedientes);
    const nuevo: Expediente = { ...datos, id, ultimoMovimiento: hoyISO() };
    setExpedientes((prev) => [...prev, nuevo]);
    return id;
  }, [expedientes]);

  const actualizarExpediente = useCallback(
    (id: string, datos: DatosExpediente) => {
      setExpedientes((prev) =>
        prev.map((exp) =>
          exp.id === id
            ? { ...exp, ...datos, id, ultimoMovimiento: hoyISO() }
            : exp,
        ),
      );
    },
    [],
  );

  const eliminarExpediente = useCallback((id: string) => {
    setExpedientes((prev) => prev.filter((exp) => exp.id !== id));
  }, []);

  const restablecerMock = useCallback(() => {
    setExpedientes(EXPEDIENTES_MOCK);
  }, []);

  const obtenerExpediente = useCallback(
    (id: string) => expedientes.find((exp) => exp.id === id),
    [expedientes],
  );

  const value = useMemo(
    () => ({
      expedientes,
      cargado,
      moverEtapa,
      crearExpediente,
      actualizarExpediente,
      eliminarExpediente,
      restablecerMock,
      obtenerExpediente,
    }),
    [
      expedientes,
      cargado,
      moverEtapa,
      crearExpediente,
      actualizarExpediente,
      eliminarExpediente,
      restablecerMock,
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
