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

  async function borrar(id: string) {
    await eliminarUsuario(id);
    setUsuarios((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-carbon/10 bg-white scrollbar-sutil">
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
                <p className="font-medium text-verde-profundo">
                  {u.nombre || "(sin nombre)"}
                </p>
                <p className="text-xs text-carbon/50">{u.email}</p>
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
