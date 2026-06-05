"use client";

import { useState } from "react";
import { actualizarUsuario, eliminarUsuario } from "@/app/actions/usuarios";
import type { UsuarioApp } from "@/app/actions/usuarios";

/** Tabla de usuarios con edición de rol/estado y eliminación. */
export function TablaUsuarios({ inicial }: { inicial: UsuarioApp[] }) {
  const [usuarios, setUsuarios] = useState<UsuarioApp[]>(inicial);
  const [guardando, setGuardando] = useState<string | null>(null);

  async function guardar(u: UsuarioApp, cambios: Partial<UsuarioApp>) {
    const actualizado = { ...u, ...cambios };
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? actualizado : x)));
    setGuardando(u.id);
    try {
      await actualizarUsuario(u.id, {
        nombre: actualizado.nombre,
        rol: actualizado.rol,
        activo: actualizado.activo,
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
              <Th>Rol</Th>
              <Th>Estado</Th>
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
            {/* Nombre y Email */}
            <div className="border-b border-carbon/5 pb-3">
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
              <p className="mt-1.5 px-1 text-xs text-carbon/50 font-mono">{u.email}</p>
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
