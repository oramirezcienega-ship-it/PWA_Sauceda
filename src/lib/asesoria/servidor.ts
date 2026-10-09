import "server-only";

/**
 * Utilidades de servidor de la asesoría de compra (Storage, rondas).
 * No es un archivo "use server": nada de aquí queda expuesto como endpoint;
 * solo lo usan las server actions, que validan sesión o token antes.
 */

import { supabaseServidor } from "@/lib/supabase/server";
import type { Inmueble } from "./inmuebles";

export const BUCKET_INMUEBLES = "inmuebles";

type Sb = ReturnType<typeof supabaseServidor>;

/** Firma las fotos guardadas como ruta del bucket privado; las URL completas pasan tal cual. */
export async function firmarFotos(sb: Sb, inmuebles: Inmueble[], soloPrimera = false): Promise<Inmueble[]> {
  const rutas = new Set<string>();
  for (const i of inmuebles) {
    for (const f of soloPrimera ? i.fotos.slice(0, 1) : i.fotos) {
      if (f && !/^https?:\/\//i.test(f)) rutas.add(f);
    }
  }
  const firmadas = new Map<string, string>();
  if (rutas.size > 0) {
    const { data } = await sb.storage.from(BUCKET_INMUEBLES).createSignedUrls(Array.from(rutas), 60 * 60);
    for (const d of data ?? []) if (d.path && d.signedUrl) firmadas.set(d.path, d.signedUrl);
  }
  return inmuebles.map((i) => ({
    ...i,
    fotosUrl: (soloPrimera ? i.fotos.slice(0, 1) : i.fotos)
      .map((f) => (/^https?:\/\//i.test(f) ? f : firmadas.get(f) || ""))
      .filter(Boolean),
  }));
}

/** URL firmada de subida al bucket `inmuebles` (quien la llama ya validó sesión o token). */
export async function prepararSubidaFoto(nombre: string, carpeta: string) {
  const limpio = (nombre || "foto").normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-60);
  const ruta = `${carpeta}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${limpio}`;
  const { data, error } = await supabaseServidor().storage.from(BUCKET_INMUEBLES).createSignedUploadUrl(ruta);
  if (error || !data) {
    console.error("[prepararSubidaFoto]", error);
    return { ok: false, error: "No se pudo preparar la subida de la foto." };
  }
  return { ok: true, ruta: data.path, token: data.token };
}

/** Ronda actual del expediente: la mayor registrada en propuestas o en búsquedas a aliados (o 1). */
export async function rondaActual(sb: Sb, expedienteId: string): Promise<number> {
  const [{ data: p }, { data: b }] = await Promise.all([
    sb.from("propuestas_inmuebles").select("ronda").eq("expediente_id", expedienteId).order("ronda", { ascending: false }).limit(1),
    sb.from("busquedas_aliados").select("ronda").eq("expediente_id", expedienteId).order("ronda", { ascending: false }).limit(1),
  ]);
  return Math.max(p?.[0]?.ronda ?? 1, b?.[0]?.ronda ?? 1);
}
