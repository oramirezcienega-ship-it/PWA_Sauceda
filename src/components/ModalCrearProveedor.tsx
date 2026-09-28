"use client";

import { useState } from "react";
import { crearProveedor } from "@/app/actions/proveedores";
import { type DatosProveedor, type Proveedor, CATEGORIAS_PROVEEDOR } from "@/lib/types";

interface ModalCrearProveedorProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (proveedor: Proveedor) => void;
}

export function ModalCrearProveedor({ abierto, onCerrar, onCreado }: ModalCrearProveedorProps) {
  const [nombre, setNombre] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [rfc, setRfc] = useState("");
  const [categoria, setCategoria] = useState("");
  const [otraCategoria, setOtraCategoria] = useState("");
  const [contactoNombre, setContactoNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("El nombre del proveedor es obligatorio.");
      return;
    }

    setGuardando(true);
    setError(null);

    const catFinal = categoria === "Otro" ? otraCategoria.trim() : categoria;

    const datos: DatosProveedor = {
      nombre: nombre.trim(),
      razonSocial: razonSocial.trim(),
      rfc: rfc.trim(),
      categoria: catFinal,
      contactoNombre: contactoNombre.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      direccion: direccion.trim(),
      notas: notas.trim(),
      activo: true,
    };

    try {
      const nuevo = await crearProveedor(datos);
      onCreado(nuevo);
      onCerrar();
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error al registrar el proveedor.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carbon/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all border border-carbon/10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-carbon/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sauce/15 text-lg">
              🧾
            </span>
            <div>
              <h2 className="font-titular text-lg font-bold text-verde-profundo">Nuevo Proveedor</h2>
              <p className="text-xs text-carbon/60">
                Registra un proveedor o contratista para poder ligar sus facturas/remisiones a órdenes de
                trabajo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-lg p-1 text-carbon/40 hover:bg-carbon/5 hover:text-carbon"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-rojo/10 p-3 text-xs text-rojo border border-rojo/20">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">
              Nombre del Proveedor <span className="text-rojo">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ej. Materiales del Bajío / Herrería Gómez"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">Categoría / Giro</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              >
                <option value="">Selecciona categoría</option>
                {CATEGORIAS_PROVEEDOR.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {categoria === "Otro" && (
                <input
                  type="text"
                  placeholder="Especifica categoría..."
                  value={otraCategoria}
                  onChange={(e) => setOtraCategoria(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-carbon/20 px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">RFC</label>
              <input
                type="text"
                placeholder="RFC (opcional)"
                value={rfc}
                onChange={(e) => setRfc(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">Razón Social</label>
            <input
              type="text"
              placeholder="Nombre fiscal (si aplica)"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">Contacto</label>
              <input
                type="text"
                placeholder="Nombre de contacto"
                value={contactoNombre}
                onChange={(e) => setContactoNombre(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">Teléfono</label>
              <input
                type="tel"
                placeholder="Ej. 4771234567"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">Correo</label>
            <input
              type="email"
              placeholder="correo@proveedor.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">Dirección</label>
            <input
              type="text"
              placeholder="Calle, Número, Colonia, Ciudad"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">Notas</label>
            <textarea
              rows={2}
              placeholder="Notas internas sobre este proveedor (opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce resize-none"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-carbon/10">
            <button
              type="button"
              disabled={guardando}
              onClick={onCerrar}
              className="rounded-lg border border-carbon/20 px-4 py-2 text-xs font-medium text-carbon/70 hover:bg-carbon/5 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-sauce px-5 py-2 text-xs font-medium text-white shadow-xs hover:bg-verde-profundo transition disabled:opacity-50"
            >
              {guardando ? "Creando..." : "Guardar Proveedor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
