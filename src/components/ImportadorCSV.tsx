"use client";

import { useState } from "react";
import { csvAObjetos } from "@/lib/csv";

interface Resultado {
  importados: number;
  errores: string[];
}

/**
 * Importador genérico de CSV. Lee un archivo, lo convierte a objetos por
 * encabezado, muestra una vista previa y delega la inserción a `onImportar`.
 */
export function ImportadorCSV({
  columnas,
  plantilla,
  onImportar,
  onListo,
}: {
  /** Encabezados esperados (para la guía y la plantilla). */
  columnas: { clave: string; requerido?: boolean }[];
  /** Texto de plantilla CSV de ejemplo. */
  plantilla: string;
  onImportar: (
    filas: Record<string, string>[],
  ) => Promise<Resultado>;
  /** Se llama tras una importación exitosa (p. ej. para redirigir). */
  onListo?: () => void;
}) {
  const [filas, setFilas] = useState<Record<string, string>[]>([]);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function leerArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setNombreArchivo(archivo.name);
    setResultado(null);
    setError(null);
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const objetos = csvAObjetos(String(lector.result));
        if (objetos.length === 0) {
          setError("El archivo no tiene filas de datos.");
          setFilas([]);
          return;
        }
        setFilas(objetos);
      } catch {
        setError("No se pudo leer el archivo CSV.");
      }
    };
    lector.readAsText(archivo);
  }

  async function importar() {
    setImportando(true);
    setError(null);
    try {
      const res = await onImportar(filas);
      setResultado(res);
      if (res.importados > 0 && res.errores.length === 0 && onListo) {
        setTimeout(onListo, 1200);
      }
    } catch {
      setError("Ocurrió un error al importar. Inténtalo de nuevo.");
    } finally {
      setImportando(false);
    }
  }

  function descargarPlantilla() {
    const blob = new Blob([plantilla], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Guía de columnas */}
      <div className="rounded-lg border border-carbon/10 bg-crema/40 p-3 text-sm">
        <p className="mb-1 font-medium text-verde-profundo">
          Columnas del CSV
        </p>
        <p className="text-carbon/70">
          {columnas.map((c, i) => (
            <span key={c.clave}>
              <span className="font-mono">{c.clave}</span>
              {c.requerido && <span className="text-rojo">*</span>}
              {i < columnas.length - 1 ? ", " : ""}
            </span>
          ))}
        </p>
        <button
          type="button"
          onClick={descargarPlantilla}
          className="mt-2 text-xs text-sauce underline hover:text-verde-profundo"
        >
          Descargar plantilla de ejemplo
        </button>
      </div>

      {/* Selector de archivo */}
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
          Archivo CSV
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={leerArchivo}
          className="block w-full text-sm text-carbon/70 file:mr-3 file:rounded-md file:border-0 file:bg-sauce file:px-3 file:py-2 file:text-sm file:text-crema hover:file:bg-verde-profundo"
        />
      </label>

      {error && (
        <p className="rounded-md border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm text-rojo">
          {error}
        </p>
      )}

      {/* Vista previa */}
      {filas.length > 0 && !resultado && (
        <div className="rounded-lg border border-carbon/10 bg-white p-3 text-sm">
          <p className="text-carbon/70">
            <span className="font-mono font-medium text-verde-profundo">
              {filas.length}
            </span>{" "}
            fila{filas.length === 1 ? "" : "s"} detectada
            {filas.length === 1 ? "" : "s"} en{" "}
            <span className="font-medium">{nombreArchivo}</span>.
          </p>
          <button
            type="button"
            onClick={importar}
            disabled={importando}
            className="mt-3 rounded-md bg-sauce px-4 py-2 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-60"
          >
            {importando ? "Importando…" : `Importar ${filas.length}`}
          </button>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="rounded-lg border border-sauce/30 bg-sauce/5 p-3 text-sm">
          <p className="font-medium text-verde-profundo">
            ✓ {resultado.importados} importado
            {resultado.importados === 1 ? "" : "s"}.
          </p>
          {resultado.errores.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-rojo">
              {resultado.errores.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
