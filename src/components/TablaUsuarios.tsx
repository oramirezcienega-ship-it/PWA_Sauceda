"use client";

import { useState } from "react";
import { actualizarUsuario, eliminarUsuario } from "@/app/actions/usuarios";
import type { UsuarioApp } from "@/app/actions/usuarios";

/** Tabla de usuarios con edición de rol/estado y eliminación. */
export function TablaUsuarios({ inicial }: { inicial: UsuarioApp[] }) {
  const [usuarios, setUsuarios] = useState<UsuarioApp[]>(inicial);
  const [guardando, setGuardando] = useState<string | null>(null);

  // Estados para el modal de configuración del conmutador
  const [agenteConmutador, setAgenteConmutador] = useState<UsuarioApp | null>(null);
  const [telDesvio, setTelDesvio] = useState("");
  const [dispLlamadas, setDispLlamadas] = useState(false);
  const [hInicio, setHInicio] = useState("09:00:00");
  const [hFin, setHFin] = useState("18:00:00");

  function abrirConfigConmutador(u: UsuarioApp) {
    setAgenteConmutador(u);
    setTelDesvio(u.telefono_desvio || u.telefono || "");
    setDispLlamadas(u.disponible_llamadas || false);
    setHInicio(u.horario_inicio || "09:00:00");
    setHFin(u.horario_fin || "18:00:00");
  }

  async function guardarConfigConmutador() {
    if (!agenteConmutador) return;
    setGuardando(agenteConmutador.id);
    try {
      await actualizarUsuario(agenteConmutador.id, {
        nombre: agenteConmutador.nombre,
        rol: agenteConmutador.rol,
        activo: agenteConmutador.activo,
        telefono: agenteConmutador.telefono,
        telefono_desvio: telDesvio.trim(),
        disponible_llamadas: dispLlamadas,
        horario_inicio: hInicio,
        horario_fin: hFin,
      });
      setUsuarios((prev) =>
        prev.map((x) =>
          x.id === agenteConmutador.id
            ? {
                ...x,
                telefono_desvio: telDesvio.trim(),
                disponible_llamadas: dispLlamadas,
                horario_inicio: hInicio,
                horario_fin: hFin,
              }
            : x
        )
      );
      setAgenteConmutador(null);
    } finally {
      setGuardando(null);
    }
  }

  async function guardar(u: UsuarioApp, cambios: Partial<UsuarioApp>) {
    const actualizado = { ...u, ...cambios };
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? actualizado : x)));
    setGuardando(u.id);
    try {
      await actualizarUsuario(u.id, {
        nombre: actualizado.nombre,
        rol: actualizado.rol,
        activo: actualizado.activo,
        telefono: actualizado.telefono,
      });
    } finally {
      setGuardando(null);
    }
  }

  /** Cambia el nombre en memoria mientras se escribe (sin guardar aún). */
  function cambiarNombreLocal(id: string, nombre: string) {
    setUsuarios((prev) => prev.map((x) => (x.id === id ? { ...x, nombre } : x)));
  }

  /** Persiste el nombre (al salir del campo o con Enter). */
  async function guardarNombre(u: UsuarioApp) {
    setGuardando(u.id);
    try {
      await actualizarUsuario(u.id, {
        nombre: u.nombre.trim(),
        rol: u.rol,
        activo: u.activo,
        telefono: u.telefono,
      });
    } finally {
      setGuardando(null);
    }
  }

  /** Cambia el teléfono en memoria mientras se escribe (sin guardar aún). */
  function cambiarTelefonoLocal(id: string, telefono: string) {
    setUsuarios((prev) => prev.map((x) => (x.id === id ? { ...x, telefono } : x)));
  }

  /** Persiste el teléfono (al salir del campo o con Enter). */
  async function guardarTelefono(u: UsuarioApp) {
    setGuardando(u.id);
    try {
      await actualizarUsuario(u.id, {
        nombre: u.nombre,
        rol: u.rol,
        activo: u.activo,
        telefono: u.telefono.trim(),
      });
    } finally {
      setGuardando(null);
    }
  }

  async function borrar(id: string) {
    await eliminarUsuario(id);
    setUsuarios((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-carbon/10 bg-crema/60 text-left">
              <Th>Usuario</Th>
              <Th>Teléfono / WhatsApp</Th>
              <Th>Rol</Th>
              <Th>Estado</Th>
              <Th>Conmutador</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-carbon/5">
                <td className="px-3 py-2.5">
                  <input
                    type="text"
                    value={u.nombre}
                    onChange={(e) => cambiarNombreLocal(u.id, e.target.value)}
                    onBlur={() => guardarNombre(u)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    placeholder="Nombre del usuario"
                    className="w-full rounded-md border border-carbon/15 bg-white px-2 py-1 text-sm font-medium text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
                  />
                  <p className="mt-0.5 px-1 text-xs text-carbon/50">{u.email}</p>
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="text"
                    value={u.telefono}
                    onChange={(e) => cambiarTelefonoLocal(u.id, e.target.value)}
                    onBlur={() => guardarTelefono(u)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    placeholder="Sin teléfono"
                    className="w-full rounded-md border border-carbon/15 bg-white px-2 py-1 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <select
                    value={u.rol}
                    onChange={(e) =>
                      guardar(u, { rol: e.target.value as "admin" | "asesor" })
                    }
                    className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs"
                  >
                    <option value="admin">Administrador</option>
                    <option value="asesor">Asesor</option>
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => guardar(u, { activo: !u.activo })}
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      u.activo
                        ? "bg-sauce/20 text-verde-profundo"
                        : "bg-carbon/10 text-carbon/50"
                    }`}
                  >
                    {u.activo ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => abrirConfigConmutador(u)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                      u.disponible_llamadas
                        ? "bg-yellow-50 text-yellow-800 border-yellow-200"
                        : "bg-carbon/5 text-carbon/60 border-carbon/10"
                    }`}
                  >
                    {u.disponible_llamadas ? "🟢 De Guardia" : "⚙️ Configurar"}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {guardando === u.id && (
                    <span className="mr-2 text-xs text-carbon/40">Guardando…</span>
                  )}
                  <BotonBorrar onConfirm={() => borrar(u.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vista de Tarjetas para Móviles */}
      <div className="space-y-3 md:hidden">
        {usuarios.map((u) => (
          <div
            key={u.id}
            className="rounded-xl border border-carbon/10 bg-white p-4 shadow-sm transition-all hover:border-sauce/40"
          >
            {/* Nombre, Email y Teléfono */}
            <div className="border-b border-carbon/5 pb-3 space-y-2">
              <div>
                <input
                  type="text"
                  value={u.nombre}
                  onChange={(e) => cambiarNombreLocal(u.id, e.target.value)}
                  onBlur={() => guardarNombre(u)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  placeholder="Nombre del usuario"
                  className="w-full rounded-md border border-carbon/15 bg-white px-2.5 py-1 text-sm font-semibold text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
                />
                <p className="mt-1 px-1 text-xs text-carbon/50 font-mono">{u.email}</p>
              </div>
              <div className="px-1">
                <span className="text-[10px] uppercase tracking-wider text-carbon/40 font-semibold font-cuerpo">Teléfono / WhatsApp</span>
                <input
                  type="text"
                  value={u.telefono}
                  onChange={(e) => cambiarTelefonoLocal(u.id, e.target.value)}
                  onBlur={() => guardarTelefono(u)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  placeholder="Sin teléfono"
                  className="mt-1 w-full rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
                />
              </div>
            </div>

            {/* Rol y Estado */}
            <div className="flex items-center justify-between py-3 text-sm">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-carbon/40 font-semibold">Rol</span>
                <select
                  value={u.rol}
                  onChange={(e) =>
                    guardar(u, { rol: e.target.value as "admin" | "asesor" })
                  }
                  className="rounded-md border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none"
                >
                  <option value="admin">Administrador</option>
                  <option value="asesor">Asesor</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 items-end">
                <span className="text-[10px] uppercase tracking-wider text-carbon/40 font-semibold font-cuerpo">Estado</span>
                <button
                  type="button"
                  onClick={() => guardar(u, { activo: !u.activo })}
                  className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                    u.activo
                      ? "bg-sauce/20 text-verde-profundo border border-sauce/25"
                      : "bg-carbon/10 text-carbon/50"
                  }`}
                >
                  {u.activo ? "Activo" : "Inactivo"}
                </button>
              </div>
            </div>

            {/* Ajustes Conmutador Móvil */}
            <div className="flex items-center justify-between border-t border-carbon/5 py-3">
              <span className="text-xs text-carbon/60 font-semibold">Conmutador (Guardia)</span>
              <button
                type="button"
                onClick={() => abrirConfigConmutador(u)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold border transition ${
                  u.disponible_llamadas
                    ? "bg-yellow-50 text-yellow-800 border-yellow-200"
                    : "bg-carbon/5 text-carbon/60 border-carbon/10"
                }`}
              >
                {u.disponible_llamadas ? "🟢 Activo" : "⚙️ Ajustar Horarios"}
              </button>
            </div>

            {/* Acciones de Guardando / Borrar */}
            <div className="flex items-center justify-between border-t border-carbon/5 pt-3">
              <div>
                {guardando === u.id && (
                  <span className="text-xs text-carbon/40 font-semibold">Guardando…</span>
                )}
              </div>
              <BotonBorrar onConfirm={() => borrar(u.id)} />
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Configuración del Conmutador */}
      {agenteConmutador && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-carbon/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-dorado/30 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-carbon/10 pb-3">
              <div>
                <h3 className="font-titular text-lg font-semibold text-verde-profundo">
                  Ajustes de Conmutador
                </h3>
                <p className="text-xs text-carbon/50">
                  Configura desvíos y guardia para <strong>{agenteConmutador.nombre}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAgenteConmutador(null)}
                className="rounded-full p-1.5 hover:bg-carbon/5 text-carbon/60 transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Teléfono de Desvío */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-carbon/40 block mb-1">
                  Teléfono de Desvío (Celular)
                </label>
                <input
                  type="text"
                  value={telDesvio}
                  onChange={(e) => setTelDesvio(e.target.value)}
                  placeholder="Ej: +52XXXXXXXXXX"
                  className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
                />
                <span className="text-[10px] text-carbon/40 mt-1 block">
                  Número al que Twilio desviará las llamadas. Debe incluir lada del país.
                </span>
              </div>

              {/* Disponible (De guardia) */}
              <div className="flex items-center justify-between rounded-xl border border-carbon/10 p-3 bg-crema/25">
                <div>
                  <span className="text-xs font-bold text-verde-profundo block">
                    Activar guardia telefónica
                  </span>
                  <span className="text-[10px] text-carbon/50 block">
                    Permite recibir llamadas en su celular.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDispLlamadas(!dispLlamadas)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition border ${
                    dispLlamadas
                      ? "bg-sauce/20 text-verde-profundo border-sauce/30"
                      : "bg-carbon/10 text-carbon/50 border-carbon/15"
                  }`}
                >
                  {dispLlamadas ? "Activo" : "Inactivo"}
                </button>
              </div>

              {/* Horarios */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-carbon/40 block mb-1">
                    Hora de Inicio
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={hInicio}
                    onChange={(e) => setHInicio(e.target.value)}
                    className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-carbon/40 block mb-1">
                    Hora de Fin
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={hFin}
                    onChange={(e) => setHFin(e.target.value)}
                    className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex justify-end gap-2 border-t border-carbon/5 pt-3">
              <button
                type="button"
                onClick={() => setAgenteConmutador(null)}
                className="rounded-lg bg-carbon/10 hover:bg-carbon/25 text-carbon px-4 py-2 text-sm font-medium transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarConfigConmutador}
                className="rounded-lg bg-sauce hover:bg-verde-profundo text-crema px-4 py-2 text-sm font-semibold transition"
              >
                Guardar Ajustes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BotonBorrar({ onConfirm }: { onConfirm: () => void }) {
  const [c, setC] = useState(false);
  if (!c) {
    return (
      <button
        type="button"
        onClick={() => setC(true)}
        className="text-xs text-rojo/70 hover:text-rojo"
      >
        Eliminar
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <button
        type="button"
        onClick={onConfirm}
        className="rounded bg-rojo px-2 py-1 font-medium text-crema"
      >
        Sí
      </button>
      <button
        type="button"
        onClick={() => setC(false)}
        className="px-1 text-carbon/60"
      >
        No
      </button>
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2.5 text-[10px] font-medium uppercase tracking-wide text-carbon/50">
      {children}
    </th>
  );
}
