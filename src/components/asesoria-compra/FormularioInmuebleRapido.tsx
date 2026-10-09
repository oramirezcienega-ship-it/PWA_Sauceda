"use client";

import { useState } from "react";
import { formatoPesos } from "@/lib/formato";
import { ETIQUETA_CREDITO, TIPOS_CREDITO } from "@/lib/asesoria/match";
import type { DatosInmuebleRapido } from "@/app/actions/asesoria-compra";
import { SubidorFotos, type PrepararSubida } from "./SubidorFotos";

const INPUT =
  "w-full rounded-md border border-carbon/20 bg-white px-2.5 py-2 text-sm focus:border-sauce focus:outline-none";

const VACIO = {
  urlFuente: "",
  precio: "",
  zona: "",
  fraccionamiento: "",
  colonia: "",
  direccionPrivada: "",
  metrosConstruccion: "",
  metrosTerreno: "",
  recamaras: "",
  banos: "",
  aceptaCredito: [] as string[],
  tieneEscritura: null as boolean | null,
  tieneAdeudos: null as boolean | null,
  tieneLitigios: null as boolean | null,
  descripcionPublica: "",
  notasInternas: "",
  fotos: [] as string[],
};

/**
 * Formulario corto de un inmueble (mobile-first). Se usa para "Agregar desde
 * portal" y, en la fase de aliados, para el link público de carga.
 */
export function FormularioInmuebleRapido({
  modo,
  preparar,
  onGuardar,
  onCancelar,
  minimoFotos = 0,
  maximoFotos = 15,
}: {
  modo: "portal" | "aliado";
  preparar: PrepararSubida;
  onGuardar: (datos: DatosInmuebleRapido) => Promise<{ ok: boolean; mensaje?: string }>;
  onCancelar?: () => void;
  minimoFotos?: number;
  maximoFotos?: number;
}) {
  const [d, setD] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof VACIO>(k: K, v: (typeof VACIO)[K]) {
    setD((x) => ({ ...x, [k]: v }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (d.fotos.length < minimoFotos) {
      setError(`Sube al menos ${minimoFotos} fotos.`);
      return;
    }
    setGuardando(true);
    const r = await onGuardar({ ...d, tieneEscritura: d.tieneEscritura, tieneAdeudos: d.tieneAdeudos });
    setGuardando(false);
    if (!r.ok) {
      setError(r.mensaje || "No se pudo guardar.");
      return;
    }
    setD(VACIO);
  }

  const precioNum = Number(d.precio.replace(/\D/g, "")) || 0;

  return (
    <form onSubmit={enviar} className="space-y-3 text-sm">
      {modo === "portal" && (
        <Campo etiqueta="URL de la publicación *">
          <input
            type="url"
            required
            value={d.urlFuente}
            onChange={(e) => set("urlFuente", e.target.value)}
            placeholder="https://www.inmuebles24.com/…"
            className={INPUT}
          />
        </Campo>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Precio *" ancho>
          <input
            type="text"
            inputMode="numeric"
            required
            value={d.precio}
            onChange={(e) => {
              const n = e.target.value.replace(/\D/g, "");
              set("precio", n ? formatoPesos(Number(n)) : "");
            }}
            placeholder="$850,000"
            className={`${INPUT} font-mono text-base`}
          />
        </Campo>
        <Campo etiqueta="Fraccionamiento">
          <input value={d.fraccionamiento} onChange={(e) => set("fraccionamiento", e.target.value)} className={INPUT} />
        </Campo>
        <Campo etiqueta="Zona / colonia">
          <input value={d.zona} onChange={(e) => set("zona", e.target.value)} className={INPUT} />
        </Campo>
        <Campo etiqueta={modo === "aliado" ? "Dirección (solo la ve SAUCEDA)" : "Dirección (privada)"} ancho>
          <input value={d.direccionPrivada} onChange={(e) => set("direccionPrivada", e.target.value)} className={INPUT} />
        </Campo>
        <Campo etiqueta="m² construcción">
          <input inputMode="decimal" value={d.metrosConstruccion} onChange={(e) => set("metrosConstruccion", e.target.value)} className={INPUT} />
        </Campo>
        <Campo etiqueta="m² terreno">
          <input inputMode="decimal" value={d.metrosTerreno} onChange={(e) => set("metrosTerreno", e.target.value)} className={INPUT} />
        </Campo>
        <Campo etiqueta="Recámaras">
          <input inputMode="numeric" value={d.recamaras} onChange={(e) => set("recamaras", e.target.value)} className={INPUT} />
        </Campo>
        <Campo etiqueta="Baños">
          <input inputMode="decimal" value={d.banos} onChange={(e) => set("banos", e.target.value)} className={INPUT} />
        </Campo>
      </div>

      <Campo etiqueta="Créditos que acepta">
        <div className="flex flex-wrap gap-1.5">
          {TIPOS_CREDITO.map((c) => {
            const activo = d.aceptaCredito.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => set("aceptaCredito", activo ? d.aceptaCredito.filter((x) => x !== c) : [...d.aceptaCredito, c])}
                className={`rounded-full border px-3 py-1.5 text-xs ${activo ? "border-sauce bg-sauce text-crema" : "border-carbon/20 bg-white text-carbon/70"}`}
              >
                {ETIQUETA_CREDITO[c]}
              </button>
            );
          })}
        </div>
      </Campo>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SiNo etiqueta="¿Tiene escritura?" valor={d.tieneEscritura} onCambio={(v) => set("tieneEscritura", v)} />
        <SiNo etiqueta="¿Tiene adeudos?" valor={d.tieneAdeudos} onCambio={(v) => set("tieneAdeudos", v)} />
        {modo === "portal" && <SiNo etiqueta="¿Litigios?" valor={d.tieneLitigios} onCambio={(v) => set("tieneLitigios", v)} />}
      </div>

      <Campo etiqueta={`Fotos${minimoFotos ? ` (${minimoFotos} a ${maximoFotos})` : ""}`}>
        <SubidorFotos rutas={d.fotos} onCambio={(f) => set("fotos", f)} preparar={preparar} minimo={minimoFotos} maximo={maximoFotos} />
      </Campo>

      {modo === "portal" && (
        <>
          <Campo etiqueta="Descripción para el cliente (opcional)">
            <textarea rows={2} value={d.descripcionPublica} onChange={(e) => set("descripcionPublica", e.target.value)} className={INPUT} placeholder="Se genera sola si la dejas vacía" />
          </Campo>
          <Campo etiqueta="Notas internas">
            <textarea rows={2} value={d.notasInternas} onChange={(e) => set("notasInternas", e.target.value)} className={INPUT} />
          </Campo>
        </>
      )}

      {error && <p className="rounded-md bg-rojo/10 px-3 py-2 text-xs text-rojo">{error}</p>}

      <div className="flex gap-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="flex-1 rounded-md border border-carbon/15 px-3 py-2.5 text-sm text-carbon/70">
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={guardando || precioNum <= 0}
          className="flex-1 rounded-md bg-sauce px-3 py-2.5 text-sm font-semibold text-crema hover:bg-verde-profundo disabled:opacity-50"
        >
          {guardando ? "Guardando…" : modo === "aliado" ? "Enviar casa" : "Agregar al inventario"}
        </button>
      </div>
    </form>
  );
}

function Campo({ etiqueta, children, ancho }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <label className={`block ${ancho ? "col-span-2" : ""}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase text-carbon/50">{etiqueta}</span>
      {children}
    </label>
  );
}

function SiNo({ etiqueta, valor, onCambio }: { etiqueta: string; valor: boolean | null; onCambio: (v: boolean | null) => void }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-bold uppercase text-carbon/50">{etiqueta}</span>
      <div className="flex gap-1.5">
        {[
          { v: true, t: "Sí" },
          { v: false, t: "No" },
        ].map((o) => (
          <button
            key={o.t}
            type="button"
            onClick={() => onCambio(valor === o.v ? null : o.v)}
            className={`flex-1 rounded-md border px-3 py-2 text-sm ${valor === o.v ? "border-sauce bg-sauce text-crema" : "border-carbon/20 bg-white text-carbon/70"}`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}
