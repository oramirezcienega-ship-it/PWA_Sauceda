"use client";

import { useEffect, useState } from "react";
import {
  listarRespuestasRapidas,
  guardarRespuestaRapida,
  eliminarRespuestaRapida,
  type RespuestaRapidaDB,
} from "@/app/actions/conversaciones";

const CATEGORIAS = ["General", "Productos", "FAQs", "Seguimiento", "Otro"];

const PARAMS_DISPONIBLES: { clave: string; descripcion: string }[] = [
  { clave: "{{nombre}}", descripcion: "Primer nombre del cliente" },
  { clave: "{{nombre_completo}}", descripcion: "Nombre completo del cliente" },
  { clave: "{{asesor}}", descripcion: "Nombre del asesor actual" },
  { clave: "{{fraccionamiento}}", descripcion: "Fraccionamiento / zona de interés" },
];

const RR_VACIA: Omit<RespuestaRapidaDB, "id" | "created_at"> = {
  atajo: "",
  titulo: "",
  texto: "",
  categoria: "General",
  orden: 0,
};

const INPUT = "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";

export function RespuestasRapidasEditor() {
  const [respuestas, setRespuestas] = useState<RespuestaRapidaDB[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<RespuestaRapidaDB> | null>(null);
  const [mostrarParams, setMostrarParams] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      setRespuestas(await listarRespuestasRapidas());
    } catch {
      setError("No se pudieron cargar las respuestas rápidas.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { void cargar(); }, []);

  function abrirNueva() {
    setEditando({ ...RR_VACIA });
    setError(null);
  }

  function abrirEdicion(rr: RespuestaRapidaDB) {
    setEditando({ ...rr });
    setError(null);
  }

  function cancelarEdicion() {
    setEditando(null);
    setError(null);
  }

  function insertarParam(param: string) {
    setEditando((prev) => {
      if (!prev) return prev;
      const cursor = (document.getElementById("rr-texto") as HTMLTextAreaElement | null)?.selectionStart ?? prev.texto?.length ?? 0;
      const texto = prev.texto ?? "";
      return { ...prev, texto: texto.slice(0, cursor) + param + texto.slice(cursor) };
    });
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    if (!editando.atajo?.trim()) { setError("El atajo es requerido."); return; }
    if (!editando.titulo?.trim()) { setError("El título es requerido."); return; }
    if (!editando.texto?.trim()) { setError("El texto es requerido."); return; }

    // Validar atajo: solo letras, números y guiones
    if (!/^[a-z0-9_-]+$/.test(editando.atajo)) {
      setError("El atajo solo puede contener letras minúsculas, números, guiones o guiones bajos.");
      return;
    }

    setGuardando(true);
    setError(null);

    const r = await guardarRespuestaRapida({
      id: editando.id,
      atajo: editando.atajo.trim(),
      titulo: editando.titulo.trim(),
      texto: editando.texto.trim(),
      categoria: editando.categoria ?? "General",
      orden: editando.orden ?? 0,
    });

    setGuardando(false);

    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar.");
      return;
    }

    setExito(editando.id ? "Respuesta actualizada." : "Respuesta creada.");
    setTimeout(() => setExito(null), 2500);
    setEditando(null);
    void cargar();
  }

  async function handleEliminar(rr: RespuestaRapidaDB) {
    if (!window.confirm(`¿Eliminar "${rr.titulo}"?`)) return;
    const r = await eliminarRespuestaRapida(rr.id);
    if (!r.ok) { setError(r.error ?? "No se pudo eliminar."); return; }
    void cargar();
  }

  const agrupadasPor = CATEGORIAS.reduce<Record<string, RespuestaRapidaDB[]>>((acc, cat) => {
    acc[cat] = respuestas.filter((r) => r.categoria === cat);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl space-y-5">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-titular text-xl font-bold text-verde-profundo">Respuestas Rápidas</h2>
          <p className="text-xs text-carbon/50 mt-0.5">
            Edita el catálogo de respuestas. Usa <strong className="text-sauce">#atajo</strong> en la bandeja para insertarlas.
            Soporta parámetros como <code className="bg-carbon/5 px-1 rounded text-[10px]">{"{{nombre}}"}</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNueva}
          disabled={!!editando}
          className="shrink-0 rounded-md bg-sauce px-3 py-1.5 text-sm font-semibold text-crema hover:bg-verde-profundo disabled:opacity-40 transition"
        >
          + Nueva
        </button>
      </div>

      {/* Formulario de edición */}
      {editando && (
        <form
          onSubmit={handleGuardar}
          className="rounded-xl border border-sauce/25 bg-sauce/5 p-4 space-y-3"
        >
          <h3 className="text-sm font-bold text-verde-profundo">
            {editando.id ? "Editar respuesta rápida" : "Nueva respuesta rápida"}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-carbon/60">Atajo * <span className="font-normal text-carbon/40">(sin espacios, minúsculas)</span></label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-sauce font-bold">#</span>
                <input
                  type="text"
                  value={editando.atajo ?? ""}
                  onChange={(e) => setEditando((p) => ({ ...p, atajo: e.target.value.toLowerCase().replace(/\s/g, "") }))}
                  placeholder="saludo"
                  className={INPUT}
                  required
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-carbon/60">Título *</label>
              <input
                type="text"
                value={editando.titulo ?? ""}
                onChange={(e) => setEditando((p) => ({ ...p, titulo: e.target.value }))}
                placeholder="Saludo inicial"
                className={INPUT}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-carbon/60">Categoría</label>
              <select
                value={editando.categoria ?? "General"}
                onChange={(e) => setEditando((p) => ({ ...p, categoria: e.target.value }))}
                className={INPUT}
              >
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-carbon/60">Orden (número)</label>
              <input
                type="number"
                value={editando.orden ?? 0}
                onChange={(e) => setEditando((p) => ({ ...p, orden: parseInt(e.target.value) || 0 }))}
                className={INPUT}
                min={0}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-carbon/60">Texto del mensaje *</label>
              <button
                type="button"
                onClick={() => setMostrarParams(!mostrarParams)}
                className="text-[10px] text-sauce hover:text-verde-profundo font-semibold underline underline-offset-1"
              >
                {mostrarParams ? "Ocultar parámetros" : "Insertar parámetro ▾"}
              </button>
            </div>
            {mostrarParams && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-white rounded border border-carbon/10">
                {PARAMS_DISPONIBLES.map((p) => (
                  <button
                    key={p.clave}
                    type="button"
                    onClick={() => insertarParam(p.clave)}
                    title={p.descripcion}
                    className="rounded bg-sauce/15 px-2 py-0.5 text-[10px] font-mono font-semibold text-verde-profundo hover:bg-sauce/30 transition"
                  >
                    {p.clave}
                  </button>
                ))}
                <span className="self-center text-[10px] text-carbon/35">Haz clic para insertar en el cursor</span>
              </div>
            )}
            <textarea
              id="rr-texto"
              value={editando.texto ?? ""}
              onChange={(e) => setEditando((p) => ({ ...p, texto: e.target.value }))}
              rows={4}
              placeholder="Hola {{nombre}}, soy {{asesor}} de SAUCEDA Bienes Raíces..."
              className={INPUT}
              required
            />
            <p className="text-[10px] text-carbon/35 px-1">
              Parámetros disponibles: <code className="bg-carbon/5 px-0.5 rounded">{"{{nombre}}"}</code> · <code className="bg-carbon/5 px-0.5 rounded">{"{{nombre_completo}}"}</code> · <code className="bg-carbon/5 px-0.5 rounded">{"{{asesor}}"}</code> · <code className="bg-carbon/5 px-0.5 rounded">{"{{fraccionamiento}}"}</code>
            </p>
          </div>

          {error && <p className="text-xs text-rojo bg-rojo/5 border border-rojo/20 rounded px-3 py-2">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={guardando}
              className="rounded-md bg-sauce px-4 py-2 text-sm font-semibold text-crema hover:bg-verde-profundo disabled:opacity-50 transition"
            >
              {guardando ? "Guardando…" : (editando.id ? "Actualizar" : "Crear")}
            </button>
            <button
              type="button"
              onClick={cancelarEdicion}
              className="rounded-md border border-carbon/20 px-4 py-2 text-sm text-carbon/60 hover:bg-carbon/5 transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {exito && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">{exito}</p>}

      {/* Lista agrupada por categoría */}
      {cargando ? (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-sauce border-t-transparent" />
        </div>
      ) : respuestas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-carbon/20 py-12 text-center">
          <p className="text-3xl">⚡</p>
          <p className="mt-2 text-sm font-semibold text-carbon/40">No hay respuestas rápidas</p>
          <p className="text-xs text-carbon/30 mt-0.5">
            Crea tu primera respuesta rápida o ejecuta el SQL de migración en Supabase.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {CATEGORIAS.map((cat) => {
            const lista = agrupadasPor[cat];
            if (!lista || lista.length === 0) return null;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-carbon/35">{cat}</span>
                  <div className="flex-1 h-px bg-carbon/8" />
                </div>
                <div className="space-y-1.5">
                  {lista.map((rr) => (
                    <div
                      key={rr.id}
                      className="flex items-start gap-3 rounded-lg border border-carbon/8 bg-white p-3 group hover:border-sauce/30 transition"
                    >
                      <span className="mt-0.5 rounded bg-sauce/15 px-1.5 py-0.5 text-[10px] font-mono font-bold text-verde-profundo shrink-0">
                        #{rr.atajo}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-carbon">{rr.titulo}</p>
                        <p className="text-[11px] text-carbon/55 mt-0.5 whitespace-pre-wrap leading-relaxed line-clamp-3">
                          {rr.texto}
                        </p>
                        {/\{\{[^}]+\}\}/.test(rr.texto) && (
                          <div className="flex gap-1 flex-wrap mt-1">
                            {Array.from(rr.texto.matchAll(/\{\{([^}]+)\}\}/g)).map(([full], i) => (
                              <span key={i} className="rounded bg-dorado/15 px-1 py-0.5 text-[9px] font-mono text-carbon/60">
                                {full}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
                        <button
                          type="button"
                          onClick={() => abrirEdicion(rr)}
                          className="rounded border border-carbon/15 px-2 py-1 text-[10px] font-semibold text-carbon/60 hover:text-verde-profundo hover:border-sauce/40 transition"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEliminar(rr)}
                          className="rounded border border-rojo/20 px-2 py-1 text-[10px] font-semibold text-rojo hover:bg-rojo/5 transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
