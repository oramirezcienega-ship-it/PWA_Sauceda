"use client";

import { useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/cliente-navegador";

export type PrepararSubida = (nombre: string) => Promise<{ ok: boolean; ruta?: string; token?: string; error?: string }>;

/**
 * Sube fotos directo al bucket privado `inmuebles` con URLs firmadas
 * (no pasan por la función de Netlify). Devuelve las rutas guardadas.
 */
export function SubidorFotos({
  rutas,
  onCambio,
  preparar,
  minimo = 0,
  maximo = 15,
}: {
  rutas: string[];
  onCambio: (rutas: string[]) => void;
  preparar: PrepararSubida;
  minimo?: number;
  maximo?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(0);
  const [vistas, setVistas] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setError(null);
    const lista = Array.from(archivos).slice(0, Math.max(0, maximo - rutas.length));
    if (lista.length < archivos.length) setError(`Máximo ${maximo} fotos.`);
    setSubiendo(lista.length);
    const nuevas: string[] = [];
    const nuevasVistas: Record<string, string> = {};
    for (const archivo of lista) {
      try {
        const prep = await preparar(archivo.name);
        if (!prep.ok || !prep.ruta || !prep.token) throw new Error(prep.error || "No se pudo preparar la subida.");
        const { error: e } = await supabaseNavegador()
          .storage.from("inmuebles")
          .uploadToSignedUrl(prep.ruta, prep.token, archivo, { contentType: archivo.type || "image/jpeg" });
        if (e) throw new Error(e.message);
        nuevas.push(prep.ruta);
        nuevasVistas[prep.ruta] = URL.createObjectURL(archivo);
      } catch (err: any) {
        setError(`No se pudo subir ${archivo.name}: ${err?.message || "error"}`);
      } finally {
        setSubiendo((n) => n - 1);
      }
    }
    setVistas((v) => ({ ...v, ...nuevasVistas }));
    onCambio([...rutas, ...nuevas]);
    if (input.current) input.current.value = "";
  }

  const faltan = Math.max(0, minimo - rutas.length);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {rutas.map((r, i) => (
          <div key={r} className="relative aspect-square overflow-hidden rounded-md border border-carbon/10 bg-carbon/5">
            {vistas[r] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vistas[r]} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center text-[10px] text-carbon/50">Foto {i + 1}</span>
            )}
            <button
              type="button"
              onClick={() => onCambio(rutas.filter((x) => x !== r))}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1.5 text-xs text-white"
              aria-label="Quitar foto"
            >
              ×
            </button>
          </div>
        ))}
        {rutas.length < maximo && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex aspect-square flex-col items-center justify-center rounded-md border-2 border-dashed border-carbon/20 text-carbon/50 hover:border-sauce hover:text-sauce"
          >
            <span className="text-2xl leading-none">＋</span>
            <span className="text-[10px]">Fotos</span>
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => subir(e.target.files)}
      />
      <p className="text-[11px] text-carbon/50">
        {subiendo > 0
          ? `Subiendo ${subiendo} foto${subiendo === 1 ? "" : "s"}…`
          : faltan > 0
          ? `Faltan ${faltan} foto${faltan === 1 ? "" : "s"} (mínimo ${minimo}, máximo ${maximo}).`
          : `${rutas.length} de ${maximo} fotos.`}
      </p>
      {error && <p className="text-[11px] text-rojo">{error}</p>}
    </div>
  );
}
