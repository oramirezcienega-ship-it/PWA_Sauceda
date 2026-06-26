"use client";

import { useState, useEffect } from "react";
import { actualizarUsuario, eliminarUsuario } from "@/app/actions/usuarios";
import type { UsuarioApp } from "@/app/actions/usuarios";
import { CalendarioGuardias } from "./CalendarioGuardias";

/** Tarjeta individual de usuario en formato fila (horizontal). */
interface TarjetaUsuarioProps {
  u: UsuarioApp;
  onUpdate: (id: string, cambios: Partial<UsuarioApp>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onConfigConmutador: (u: UsuarioApp) => void;
  usuarioActualId: string;
}

function TarjetaUsuario({ u, onUpdate, onDelete, onConfigConmutador, usuarioActualId }: TarjetaUsuarioProps) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Estados locales para la edición
  const [nombre, setNombre] = useState(u.nombre);
  const [telefono, setTelefono] = useState(u.telefono);
  const [rol, setRol] = useState(u.rol);
  const [activo, setActivo] = useState(u.activo);

  // Sincronizar el estado local cuando cambien los datos del prop (ej. desde el modal)
  useEffect(() => {
    setNombre(u.nombre);
    setTelefono(u.telefono);
    setRol(u.rol);
    setActivo(u.activo);
  }, [u.nombre, u.telefono, u.rol, u.activo]);

  async function handleGuardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    try {
      await onUpdate(u.id, {
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        rol,
        activo,
      });
      setEditando(false);
    } catch (err) {
      console.error("Error al actualizar usuario:", err);
    } finally {
      setGuardando(false);
    }
  }

  function handleCancelar() {
    setNombre(u.nombre);
    setTelefono(u.telefono);
    setRol(u.rol);
    setActivo(u.activo);
    setEditando(false);
  }

  const inicialNombre = u.nombre.trim().charAt(0).toUpperCase() || "?";

  if (editando) {
    return (
      <div className="flex w-full flex-col justify-between rounded-2xl border-2 border-sauce/30 bg-white p-5 shadow-lg transition-all duration-300">
        {/* Encabezado en Edición */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sauce/15 to-verde-profundo/10 font-titular text-base font-semibold text-verde-profundo shadow-inner">
            {inicialNombre}
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-carbon/40">Email</span>
            <span className="block truncate font-mono text-xs text-carbon/60" title={u.email}>
              {u.email}
            </span>
          </div>
        </div>

        {/* Campos de Formulario Distribuidos */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end flex-grow">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
              Nombre Completo
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del usuario"
              className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
              Teléfono / WhatsApp
            </label>
            <input
              type="text"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Sin teléfono"
              className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
              Rol
            </label>
            <select
              value={rol}
              onChange={(e) => {
                const nuevoRol = e.target.value as "admin" | "asesor";
                if (u.id === usuarioActualId && nuevoRol !== "admin") {
                  alert("No puedes cambiar tu propio rol de administrador.");
                  return;
                }
                setRol(nuevoRol);
              }}
              disabled={u.id === usuarioActualId}
              className="w-full rounded-lg border border-carbon/15 bg-white px-2 py-1.5 text-xs text-verde-profundo outline-none focus:border-sauce focus:ring-2 focus:ring-sauce/20 disabled:opacity-60 disabled:cursor-not-allowed"
              title={u.id === usuarioActualId ? "No puedes cambiar tu propio rol" : ""}
            >
              <option value="admin">Administrador</option>
              <option value="asesor">Asesor</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
              Estado
            </label>
            <button
              type="button"
              onClick={() => {
                if (u.id === usuarioActualId) {
                  alert("No puedes desactivar tu propio usuario administrador.");
                  return;
                }
                setActivo(!activo);
              }}
              className={`w-full rounded-lg border py-1.5 text-xs font-semibold transition ${
                activo
                  ? "bg-sauce/20 text-verde-profundo border-sauce/30"
                  : "bg-carbon/10 text-carbon/50 border-carbon/10"
              } ${u.id === usuarioActualId ? "opacity-60 cursor-not-allowed" : ""}`}
              title={u.id === usuarioActualId ? "No puedes desactivarte a ti mismo" : ""}
            >
              {activo ? "🟢 Activo" : "⚪ Inactivo"}
            </button>
          </div>
        </div>

        <div className="my-4 border-t border-carbon/5" />

        {/* Acciones en Edición */}
        <div className="flex items-center justify-between gap-2">
          {/* Botón borrar sutil y con confirmación */}
          {u.id !== usuarioActualId ? (
            <BotonBorrar onConfirm={() => onDelete(u.id)} />
          ) : (
            <div className="text-[10px] text-carbon/40 italic">Tu propio usuario administrador</div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelar}
              className="rounded-lg border border-carbon/10 bg-carbon/5 px-3 py-2 text-xs font-semibold text-carbon/75 transition-all hover:bg-carbon/10"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleGuardar}
              disabled={guardando || !nombre.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-sauce px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-verde-profundo disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Renderizado en Modo Lectura (Fila Horizontal en desktop, pila en móvil con rejilla de 12 columnas)
  return (
    <div className="group relative w-full rounded-2xl border border-carbon/10 bg-white p-4 shadow-sm transition-all duration-300 hover:border-sauce/30 hover:shadow-md grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
      {/* 1. Información de Usuario (Nombre y Email) */}
      <div className="col-span-1 md:col-span-3 flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sauce/15 to-verde-profundo/10 font-titular text-base font-semibold text-verde-profundo shadow-inner">
          {inicialNombre}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-titular text-base font-semibold text-carbon">
            {u.nombre}
          </h3>
          <p className="truncate font-mono text-xs text-carbon/40" title={u.email}>
            {u.email}
          </p>
        </div>
      </div>

      {/* 2. Teléfono */}
      <div className="col-span-1 md:col-span-2 flex items-center gap-2 text-sm text-carbon/70 min-w-0">
        <svg className="h-4 w-4 flex-shrink-0 text-carbon/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <span className="font-mono text-carbon/80 truncate">{u.telefono || "Sin teléfono"}</span>
      </div>

      {/* 3. Ajustes Conmutador */}
      <div className="col-span-1 md:col-span-3 flex items-center justify-between gap-2.5 rounded-xl border border-carbon/5 bg-crema p-2.5 shadow-sm min-w-0">
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-carbon/40">Conmutador</span>
          <span className="block truncate text-xs text-carbon/70">
            {u.disponible_llamadas ? `🟢 Guardia` : "⚪ Inactivo"}
          </span>
          {u.disponible_llamadas && u.telefono_desvio && (
            <span className="mt-0.5 block truncate font-mono text-[9px] text-carbon/40">
              Desvío: {u.telefono_desvio}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onConfigConmutador(u)}
          className="rounded-lg border border-carbon/10 bg-carbon/5 px-2 py-1 text-[10px] font-semibold text-carbon/70 transition hover:border-carbon/20 hover:bg-carbon/10 flex-shrink-0"
        >
          ⚙️ Ajustes
        </button>
      </div>

      {/* 4. Badges (Rol y Estado) */}
      <div className="col-span-1 md:col-span-2 flex flex-row md:flex-col gap-1.5 items-center md:items-start min-w-0">
        {u.rol === "admin" ? (
          <span className="inline-flex items-center rounded-full border border-dorado/20 bg-dorado/15 px-2.5 py-0.5 text-[10px] font-semibold text-yellow-800">
            👑 Admin
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-sauce/10 bg-sauce/10 px-2.5 py-0.5 text-[10px] font-semibold text-verde-profundo">
            💼 Asesor
          </span>
        )}
        {u.activo ? (
          <span className="inline-flex items-center rounded-full border border-sauce/20 bg-sauce/20 px-2.5 py-0.5 text-[10px] font-semibold text-verde-profundo">
            🟢 Activo
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-carbon/15 bg-carbon/10 px-2.5 py-0.5 text-[10px] font-semibold text-carbon/50">
            ⚪ Inactivo
          </span>
        )}
      </div>

      {/* 5. Acción Editar */}
      <div className="col-span-1 md:col-span-2 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="inline-flex items-center gap-1 rounded-xl border border-sauce/15 bg-sauce/5 px-3 py-1.5 text-xs font-semibold text-verde-profundo transition-all hover:border-sauce/30 hover:bg-sauce/15"
        >
          ✏️ Editar
        </button>
      </div>
    </div>
  );
}

const DIAS_SEMANA = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
];

/** Componente principal de administración de usuarios. */
export function TablaUsuarios({
  inicial,
  usuarioActualId,
}: {
  inicial: UsuarioApp[];
  usuarioActualId: string;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioApp[]>(inicial);

  // Estados para el modal de configuración del conmutador
  const [agenteConmutador, setAgenteConmutador] = useState<UsuarioApp | null>(null);
  const [telDesvio, setTelDesvio] = useState("");
  const [dispLlamadas, setDispLlamadas] = useState(false);
  const [horariosGuardia, setHorariosGuardia] = useState<Record<string, { inicio: string; fin: string }[]>>({});
  const [modalGuardando, setModalGuardando] = useState(false);

  function abrirConfigConmutador(u: UsuarioApp) {
    setAgenteConmutador(u);
    setTelDesvio(u.telefono_desvio || u.telefono || "");
    setDispLlamadas(u.disponible_llamadas || false);
    setHorariosGuardia(u.horarios_guardia || {
      lunes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      martes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      miercoles: [{ inicio: "09:00:00", fin: "18:00:00" }],
      jueves: [{ inicio: "09:00:00", fin: "18:00:00" }],
      viernes: [{ inicio: "09:00:00", fin: "18:00:00" }],
      sabado: [],
      domingo: []
    });
  }

  async function guardarConfigConmutador() {
    if (!agenteConmutador) return;
    setModalGuardando(true);
    try {
      await actualizarUsuario(agenteConmutador.id, {
        nombre: agenteConmutador.nombre,
        rol: agenteConmutador.rol,
        activo: agenteConmutador.activo,
        telefono: agenteConmutador.telefono,
        telefono_desvio: telDesvio.trim(),
        disponible_llamadas: dispLlamadas,
        horarios_guardia: horariosGuardia,
      });
      setUsuarios((prev) =>
        prev.map((x) =>
          x.id === agenteConmutador.id
            ? {
                ...x,
                telefono_desvio: telDesvio.trim(),
                disponible_llamadas: dispLlamadas,
                horarios_guardia: horariosGuardia,
              }
            : x
        )
      );
      setAgenteConmutador(null);
    } catch (err) {
      console.error("Error al guardar configuración de conmutador:", err);
    } finally {
      setModalGuardando(false);
    }
  }

  const actualizarFranja = (dia: string, index: number, campo: "inicio" | "fin", valor: string) => {
    let v = valor;
    if (valor && valor.split(":").length === 2) {
      v = `${valor}:00`;
    }
    setHorariosGuardia((prev) => {
      const slots = [...(prev[dia] || [])];
      slots[index] = { ...slots[index], [campo]: v };
      return { ...prev, [dia]: slots };
    });
  };

  const eliminarFranja = (dia: string, index: number) => {
    setHorariosGuardia((prev) => {
      const slots = (prev[dia] || []).filter((_, i) => i !== index);
      return { ...prev, [dia]: slots };
    });
  };

  const agregarFranja = (dia: string) => {
    setHorariosGuardia((prev) => {
      const slots = [...(prev[dia] || [])];
      slots.push({ inicio: "09:00:00", fin: "18:00:00" });
      return { ...prev, [dia]: slots };
    });
  };

  async function handleUpdateUsuario(id: string, cambios: Partial<UsuarioApp>) {
    const u = usuarios.find((x) => x.id === id);
    if (!u) return;
    const actualizado = { ...u, ...cambios };

    // Ejecutar server action
    await actualizarUsuario(id, {
      nombre: actualizado.nombre,
      rol: actualizado.rol,
      activo: actualizado.activo,
      telefono: actualizado.telefono,
      telefono_desvio: actualizado.telefono_desvio,
      disponible_llamadas: actualizado.disponible_llamadas,
      horario_inicio: actualizado.horario_inicio,
      horario_fin: actualizado.horario_fin,
    });

    // Actualizar estado si la llamada al servidor no falló
    setUsuarios((prev) => prev.map((x) => (x.id === id ? actualizado : x)));
  }

  async function handleDeleteUsuario(id: string) {
    await eliminarUsuario(id);
    setUsuarios((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <>
      {usuarios.length === 0 ? (
        <div className="rounded-2xl border border-carbon/10 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-carbon/50">No hay usuarios registrados en el equipo.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {usuarios.map((u) => (
            <TarjetaUsuario
              key={u.id}
              u={u}
              onUpdate={handleUpdateUsuario}
              onDelete={handleDeleteUsuario}
              onConfigConmutador={abrirConfigConmutador}
              usuarioActualId={usuarioActualId}
            />
          ))}
        </div>
      )}

      <div className="mt-8">
        <CalendarioGuardias usuarios={usuarios} />
      </div>

      {/* Modal de Configuración del Conmutador */}
      {agenteConmutador && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-dorado/30 bg-white p-6 shadow-2xl">
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
                className="rounded-full p-1.5 text-carbon/60 transition hover:bg-carbon/5"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {/* Teléfono de Desvío */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                  Teléfono de Desvío (Celular)
                </label>
                <input
                  type="text"
                  value={telDesvio}
                  onChange={(e) => setTelDesvio(e.target.value)}
                  placeholder="Ej: +52XXXXXXXXXX"
                  className="w-full rounded-lg border border-carbon/15 bg-white px-3 py-1.5 text-sm text-verde-profundo outline-none transition focus:border-sauce focus:ring-2 focus:ring-sauce/30"
                />
                <span className="mt-1 block text-[10px] text-carbon/40">
                  Número al que Twilio desviará las llamadas. Debe incluir lada del país.
                </span>
              </div>

              {/* Disponible (De guardia) */}
              <div className="flex items-center justify-between rounded-xl border border-carbon/10 bg-crema/25 p-3">
                <div>
                  <span className="block text-xs font-bold text-verde-profundo">
                    Activar guardia telefónica
                  </span>
                  <span className="block text-[10px] text-carbon/50">
                    Permite recibir llamadas en su celular.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDispLlamadas(!dispLlamadas)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                    dispLlamadas
                      ? "bg-sauce/20 text-verde-profundo border-sauce/30"
                      : "bg-carbon/10 text-carbon/50 border-carbon/15"
                  }`}
                >
                  {dispLlamadas ? "Activo" : "Inactivo"}
                </button>
              </div>

              {/* Horarios por día y franjas */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-carbon/40">
                  Horario de Guardia Semanal
                </label>
                <div className="max-h-[250px] overflow-y-auto pr-1 space-y-2 rounded-xl border border-carbon/10 p-3 bg-carbon/5">
                  {DIAS_SEMANA.map((dia) => {
                    const franjas = horariosGuardia[dia.key] || [];
                    const activo = franjas.length > 0;

                    return (
                      <div key={dia.key} className="rounded-lg border border-carbon/10 bg-white p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-verde-profundo">{dia.label}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (activo) {
                                setHorariosGuardia(prev => ({ ...prev, [dia.key]: [] }));
                              } else {
                                setHorariosGuardia(prev => ({ ...prev, [dia.key]: [{ inicio: "09:00:00", fin: "18:00:00" }] }));
                              }
                            }}
                            className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold transition ${
                              activo ? "bg-verde-profundo text-crema" : "bg-carbon/10 text-carbon/50 border border-carbon/10"
                            }`}
                          >
                            {activo ? "Activo" : "Inactivo"}
                          </button>
                        </div>

                        {activo && (
                          <div className="space-y-2 pt-1.5 border-t border-carbon/5">
                            {franjas.map((franja, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <div className="flex-1">
                                  <span className="block text-[9px] text-carbon/40 font-semibold uppercase">De:</span>
                                  <input
                                    type="time"
                                    value={franja.inicio.slice(0, 5)}
                                    onChange={(e) => actualizarFranja(dia.key, idx, "inicio", e.target.value)}
                                    className="w-full rounded border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none"
                                  />
                                </div>
                                <div className="flex-1">
                                  <span className="block text-[9px] text-carbon/40 font-semibold uppercase">A:</span>
                                  <input
                                    type="time"
                                    value={franja.fin.slice(0, 5)}
                                    onChange={(e) => actualizarFranja(dia.key, idx, "fin", e.target.value)}
                                    className="w-full rounded border border-carbon/15 bg-white px-2 py-1 text-xs text-verde-profundo outline-none"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => eliminarFranja(dia.key, idx)}
                                  className="mt-4 rounded p-1 text-rojo hover:bg-rojo/10 transition"
                                  title="Eliminar franja"
                                >
                                  🗑️
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => agregarFranja(dia.key)}
                              className="text-[10px] font-bold text-sauce hover:underline block pt-0.5"
                            >
                              + Añadir franja
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex justify-end gap-2 border-t border-carbon/5 pt-3">
              <button
                type="button"
                onClick={() => setAgenteConmutador(null)}
                className="rounded-lg bg-carbon/10 px-4 py-2 text-sm font-medium text-carbon transition hover:bg-carbon/25"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarConfigConmutador}
                disabled={modalGuardando}
                className="rounded-lg bg-sauce px-4 py-2 text-sm font-semibold text-crema transition hover:bg-verde-profundo disabled:opacity-50"
              >
                {modalGuardando ? "Guardando..." : "Guardar Ajustes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BotonBorrar({ onConfirm }: { onConfirm: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  if (!confirmar) {
    return (
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        className="inline-flex items-center gap-1 py-2 text-xs font-semibold text-rojo/75 transition hover:text-rojo hover:underline"
      >
        🗑️ Eliminar
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-rojo/10 bg-rojo/5 px-2 py-1">
      <span className="text-[10px] font-bold text-rojo/80 uppercase">¿Borrar?</span>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded bg-rojo px-2 py-0.5 text-[10px] font-bold text-white transition hover:bg-red-700"
      >
        Sí
      </button>
      <button
        type="button"
        onClick={() => setConfirmar(false)}
        className="px-1.5 py-0.5 text-[10px] font-semibold text-carbon/60 hover:text-carbon"
      >
        No
      </button>
    </div>
  );
}
