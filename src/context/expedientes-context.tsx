"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { EtapaId, Expediente } from "@/lib/types";
import { EXPEDIENTES_MOCK } from "@/lib/mock-data";

/**
 * Estado en memoria de los expedientes (Incremento 1).
 * Centraliza la lista para que el tablero y el detalle compartan el
 * mismo estado y los cambios de etapa se reflejen en ambas vistas.
 *
 * FUTURO: aquí se conectará la capa de datos real (API / DB) en lugar
 * de partir de EXPEDIENTES_MOCK.
 */
interface ExpedientesContextValue {
  expedientes: Expediente[];
  /** Cambia la etapa de un expediente y actualiza su último movimiento. */
  moverEtapa: (id: string, etapa: EtapaId) => void;
  /** Busca un expediente por id. */
  obtenerExpediente: (id: string) => Expediente | undefined;
}

const ExpedientesContext = createContext<ExpedientesContextValue | null>(null);

export function ExpedientesProvider({ children }: { children: ReactNode }) {
  const [expedientes, setExpedientes] =
    useState<Expediente[]>(EXPEDIENTES_MOCK);

  const moverEtapa = useCallback((id: string, etapa: EtapaId) => {
    const hoy = new Date().toISOString().slice(0, 10);
    setExpedientes((prev) =>
      prev.map((exp) =>
        exp.id === id ? { ...exp, etapa, ultimoMovimiento: hoy } : exp,
      ),
    );
  }, []);

  const obtenerExpediente = useCallback(
    (id: string) => expedientes.find((exp) => exp.id === id),
    [expedientes],
  );

  const value = useMemo(
    () => ({ expedientes, moverEtapa, obtenerExpediente }),
    [expedientes, moverEtapa, obtenerExpediente],
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
