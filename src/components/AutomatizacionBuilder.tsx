"use client";

import { useEffect, useState } from "react";
import {
  EVENTOS,
  OPERADORES,
  TIPOS_ACCION,
  camposDeEvento,
  entidadDeEvento,
} from "@/lib/automatizaciones/catalogos";
import { ETAPAS } from "@/lib/etapas";
import { ORIGENES } from "@/lib/origenes";
import { listarFormularios } from "@/app/actions/formularios";
import { listarPlantillasWhatsApp } from "@/app/actions/whatsapp";
import type { PlantillaWhatsApp } from "@/lib/whatsapp";
import type {
  AccionAutomatizacion,
  CondicionAutomatizacion,
  DatosAutomatizacion,
  EventoAutomatizacion,
  Formulario,
  TipoAccion,
} from "@/lib/types";

const INPUT =
  "w-full rounded-md border border-carbon/15 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30";
const SELECT =
  "rounded-md border border-carbon/15 bg-white px-2 py-1.5 text-sm text-carbon outline-none focus:border-sauce";

const VACIO: DatosAutomatizacion = {
  nombre: "",
  activa: true,
  evento: "nuevo-expediente",
  condiciones: [],
  acciones: [],
};

function condicionVacia(evento: EventoAutomatizacion): CondicionAutomatizacion {
  return { campo: camposDeEvento(evento)[0]?.id ?? "", operador: "igual", valor: "" };
}

function accionVacia(): AccionAutomatizacion {
  return { tipo: "enviar-formulario" };
}

/**
 * Constructor de una regla de automatización (crear/editar). Maneja el
 * evento disparador, sus condiciones y la lista de acciones. Presentacional.
 */
export function AutomatizacionBuilder({
  valorInicial,
  textoBoton,
  onGuardar,
  onCancelar,
}: {
  valorInicial?: DatosAutomatizacion;
  textoBoton: string;
  onGuardar: (datos: DatosAutomatizacion) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState<DatosAutomatizacion>(valorInicial ?? VACIO);
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [plantillas, setPlantillas] = useState<PlantillaWhatsApp[]>([]);
  const [errorPlantillas, setErrorPlantillas] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    listarFormularios()
      .then(setFormularios)
      .catch(() => setFormularios([]));
    listarPlantillasWhatsApp()
      .then((r) => {
        setPlantillas(r.plantillas);
        if (!r.ok) setErrorPlantillas(r.error ?? "No se pudieron cargar.");
      })
      .catch(() => setErrorPlantillas("No se pudieron cargar las plantillas."));
  }, []);

  const campos = camposDeEvento(datos.evento);
  const entidad = entidadDeEvento(datos.evento);

  function set<K extends keyof DatosAutomatizacion>(
    clave: K,
    valor: DatosAutomatizacion[K],
  ) {
    setDatos((d) => ({ ...d, [clave]: valor }));
  }

  function cambiarEvento(evento: EventoAutomatizacion) {
    // Al cambiar de evento, reinicia el campo de cada condición al primero válido.
    const nuevosCampos = camposDeEvento(evento);
    setDatos((d) => ({
      ...d,
      evento,
      condiciones: d.condiciones.map((c) => ({
        ...c,
        campo: nuevosCampos.some((x) => x.id === c.campo)
          ? c.campo
          : (nuevosCampos[0]?.id ?? ""),
      })),
    }));
  }

  function setCondicion(idx: number, cambios: Partial<CondicionAutomatizacion>) {
    set(
      "condiciones",
      datos.condiciones.map((c, i) => (i === idx ? { ...c, ...cambios } : c)),
    );
  }

  function setAccion(idx: number, cambios: Partial<AccionAutomatizacion>) {
    set(
      "acciones",
      datos.acciones.map((a, i) => (i === idx ? { ...a, ...cambios } : a)),
    );
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!datos.nombre.trim()) {
      setError("Ponle un nombre a la automatización.");
      return;
    }
    if (datos.acciones.length === 0) {
      setError("Agrega al menos una acción.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await onGuardar({ ...datos, nombre: datos.nombre.trim() });
    } catch {
      setError("No se pudo guardar. Inténtalo de nuevo.");
      setEnviando(false);
    }
  }

  /** Editor del valor de una condición (selects para etapa/origen). */
  function ValorCondicion({ idx, c }: { idx: number; c: CondicionAutomatizacion }) {
    if (c.operador === "cualquiera") return null;
    if (c.campo === "etapa") {
      return (
        <select
          value={c.valor}
          onChange={(e) => setCondicion(idx, { valor: e.target.value })}
          className={SELECT}
        >
          <option value="">— elige etapa —</option>
          {ETAPAS.map((et) => (
            <option key={et.id} value={et.id}>
              {et.nombre}
            </option>
          ))}
        </select>
      );
    }
    if (c.campo === "origen") {
      return (
        <select
          value={c.valor}
          onChange={(e) => setCondicion(idx, { valor: e.target.value })}
          className={SELECT}
        >
          <option value="">— elige origen —</option>
          {ORIGENES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="text"
        value={c.valor}
        onChange={(e) => setCondicion(idx, { valor: e.target.value })}
        placeholder="valor"
        className={`${INPUT} max-w-[180px]`}
      />
    );
  }

  /** Config de la acción "enviar WhatsApp": texto libre o plantilla aprobada. */
  function ConfigWhatsApp({ idx, a }: { idx: number; a: AccionAutomatizacion }) {
    const modo = a.modoWhatsapp ?? "texto";
    const aprobadas = plantillas.filter((p) => p.estado === "APPROVED");
    const sel = plantillas.find((p) => p.nombre === a.plantilla);
    const numParams = sel?.parametros ?? 0;

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-4 text-xs text-carbon/70">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={modo === "texto"}
              onChange={() => setAccion(idx, { modoWhatsapp: "texto" })}
            />
            Texto libre (ventana 24 h)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={modo === "plantilla"}
              onChange={() => setAccion(idx, { modoWhatsapp: "plantilla" })}
            />
            Plantilla aprobada (contacto en frío)
          </label>
        </div>

        {modo === "plantilla" ? (
          <div className="space-y-2">
            <select
              value={a.plantilla ?? ""}
              onChange={(e) => {
                const p = plantillas.find((x) => x.nombre === e.target.value);
                setAccion(idx, {
                  plantilla: e.target.value,
                  idiomaPlantilla: p?.idioma,
                  parametros: [],
                });
              }}
              className={`${SELECT} w-full`}
            >
              <option value="">— elige plantilla aprobada —</option>
              {aprobadas.map((p) => {
                const snippet = p.cuerpo
                  ? ` - "${p.cuerpo.replace(/\n/g, " ").substring(0, 50)}${p.cuerpo.length > 50 ? "..." : ""}"`
                  : "";
                return (
                  <option key={`${p.nombre}-${p.idioma}`} value={p.nombre}>
                    {p.nombre} ({p.idioma}){snippet}
                  </option>
                );
              })}
            </select>

            {errorPlantillas && (
              <p className="text-xs text-rojo/80">
                {errorPlantillas} Revisa <span className="font-mono">WHATSAPP_WABA_ID</span>{" "}
                y el token, o crea/aprueba plantillas en Meta.
              </p>
            )}
            {!errorPlantillas && aprobadas.length === 0 && (
              <p className="text-xs text-carbon/50">
                No hay plantillas aprobadas en tu cuenta de WhatsApp todavía.
              </p>
            )}

            {sel && (
              <p className="whitespace-pre-line rounded-md bg-crema/40 p-2 text-xs text-carbon/60">
                {sel.cuerpo}
              </p>
            )}

            {Array.from({ length: numParams }).map((_, i) => (
              <input
                key={i}
                type="text"
                value={a.parametros?.[i] ?? ""}
                onChange={(e) => {
                  const arr = [...(a.parametros ?? [])];
                  arr[i] = e.target.value;
                  setAccion(idx, { parametros: arr });
                }}
                placeholder={`Valor para {{${i + 1}}} (admite {nombre})`}
                className={INPUT}
              />
            ))}
          </div>
        ) : (
          <textarea
            value={a.texto ?? ""}
            onChange={(e) => setAccion(idx, { texto: e.target.value })}
            rows={3}
            placeholder="Mensaje de WhatsApp. Puedes usar {nombre}…"
            className={INPUT}
          />
        )}
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      {error && (
        <p className="rounded-md border border-rojo/30 bg-rojo/10 px-3 py-2 text-sm text-rojo">
          {error}
        </p>
      )}

      {/* Nombre + activa */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="block flex-1">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
            Nombre <span className="text-rojo">*</span>
          </span>
          <input
            type="text"
            value={datos.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Ej. Enviar formulario inicial a leads nuevos"
            className={INPUT}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-carbon/70">
          <input
            type="checkbox"
            checked={datos.activa}
            onChange={(e) => set("activa", e.target.checked)}
          />
          Activa
        </label>
      </div>

      {/* Evento disparador */}
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-carbon/50">
          Cuándo (disparador)
        </span>
        <select
          value={datos.evento}
          onChange={(e) => cambiarEvento(e.target.value as EventoAutomatizacion)}
          className={`${SELECT} w-full`}
        >
          {EVENTOS.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.nombre}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-carbon/50">
          {EVENTOS.find((e) => e.id === datos.evento)?.descripcion}
        </span>
      </label>

      {/* Condiciones */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-carbon/50">
          Condiciones ({entidad}) — opcionales, se cumplen todas
        </p>
        {datos.condiciones.length === 0 && (
          <p className="text-xs text-carbon/40">
            Sin condiciones: la regla aplica siempre que ocurra el evento.
          </p>
        )}
        {datos.condiciones.map((c, idx) => (
          <div
            key={idx}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-carbon/10 bg-crema/30 p-2"
          >
            <select
              value={c.campo}
              onChange={(e) => setCondicion(idx, { campo: e.target.value })}
              className={SELECT}
            >
              {campos.map((campo) => (
                <option key={campo.id} value={campo.id}>
                  {campo.nombre}
                </option>
              ))}
            </select>
            <select
              value={c.operador}
              onChange={(e) =>
                setCondicion(idx, {
                  operador: e.target.value as CondicionAutomatizacion["operador"],
                })
              }
              className={SELECT}
            >
              {OPERADORES.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.nombre}
                </option>
              ))}
            </select>
            <ValorCondicion idx={idx} c={c} />
            <button
              type="button"
              onClick={() =>
                set(
                  "condiciones",
                  datos.condiciones.filter((_, i) => i !== idx),
                )
              }
              className="ml-auto rounded px-2 text-rojo/70 hover:text-rojo"
              title="Quitar condición"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            set("condiciones", [...datos.condiciones, condicionVacia(datos.evento)])
          }
          className="rounded-md border border-dashed border-sauce/40 px-3 py-1.5 text-xs text-sauce transition hover:bg-sauce/5"
        >
          + Agregar condición
        </button>
      </div>

      {/* Acciones */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-carbon/50">
          Entonces haz (acciones) <span className="text-rojo">*</span>
        </p>
        {datos.acciones.map((a, idx) => (
          <div
            key={idx}
            className="space-y-2 rounded-lg border border-carbon/10 bg-white p-3"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-carbon/40">{idx + 1}</span>
              <select
                value={a.tipo}
                onChange={(e) =>
                  // Cambiar de tipo limpia los campos de la acción anterior.
                  set(
                    "acciones",
                    datos.acciones.map((x, i) =>
                      i === idx ? { tipo: e.target.value as TipoAccion } : x,
                    ),
                  )
                }
                className={SELECT}
              >
                {TIPOS_ACCION.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  set(
                    "acciones",
                    datos.acciones.filter((_, i) => i !== idx),
                  )
                }
                className="ml-auto rounded px-2 text-rojo/70 hover:text-rojo"
                title="Quitar acción"
              >
                ✕
              </button>
            </div>

            {/* Config por tipo de acción */}
            {a.tipo === "enviar-formulario" && (
              <select
                value={a.formularioId ?? ""}
                onChange={(e) => setAccion(idx, { formularioId: e.target.value })}
                className={`${SELECT} w-full`}
              >
                <option value="">— elige formulario —</option>
                {formularios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.titulo}
                  </option>
                ))}
              </select>
            )}

            {a.tipo === "enviar-correo" && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={a.asunto ?? ""}
                  onChange={(e) => setAccion(idx, { asunto: e.target.value })}
                  placeholder="Asunto"
                  className={INPUT}
                />
                <input
                  type="text"
                  value={a.titulo ?? ""}
                  onChange={(e) => setAccion(idx, { titulo: e.target.value })}
                  placeholder="Título (opcional)"
                  className={INPUT}
                />
                <textarea
                  value={a.cuerpo ?? ""}
                  onChange={(e) => setAccion(idx, { cuerpo: e.target.value })}
                  rows={3}
                  placeholder="Cuerpo del correo. Puedes usar {nombre}, {fraccionamiento}…"
                  className={INPUT}
                />
              </div>
            )}

            {a.tipo === "enviar-whatsapp" && (
              <ConfigWhatsApp idx={idx} a={a} />
            )}

            {a.tipo === "mover-etapa" && (
              <select
                value={a.etapa ?? ""}
                onChange={(e) =>
                  setAccion(idx, { etapa: e.target.value as AccionAutomatizacion["etapa"] })
                }
                className={`${SELECT} w-full`}
              >
                <option value="">— elige etapa —</option>
                {ETAPAS.map((et) => (
                  <option key={et.id} value={et.id}>
                    {et.nombre}
                  </option>
                ))}
              </select>
            )}

            <p className="text-xs text-carbon/40">
              {TIPOS_ACCION.find((t) => t.id === a.tipo)?.descripcion}
            </p>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set("acciones", [...datos.acciones, accionVacia()])}
          className="rounded-md border border-dashed border-sauce/40 px-4 py-2 text-sm text-sauce transition hover:bg-sauce/5"
        >
          + Agregar acción
        </button>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          className="flex-1 rounded-md border border-carbon/15 bg-white px-4 py-2.5 text-sm text-carbon/70 transition hover:border-carbon/30 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="flex-1 rounded-md bg-sauce px-4 py-2.5 text-sm font-medium text-crema transition hover:bg-verde-profundo disabled:opacity-60"
        >
          {enviando ? "Guardando…" : textoBoton}
        </button>
      </div>
    </form>
  );
}
