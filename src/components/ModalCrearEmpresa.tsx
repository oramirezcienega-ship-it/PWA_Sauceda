"use client";

import { useState, useEffect } from "react";
import { crearEmpresa } from "@/app/actions/empresas";
import { type DatosEmpresa, type Empresa, INDUSTRIAS_COMUNES } from "@/lib/types";

interface ModalCrearEmpresaProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreada: (empresa: Empresa) => void;
  asesores: { id: string; nombre: string }[];
  defaultParentId?: string;
  defaultParentNombre?: string;
}

export function ModalCrearEmpresa({
  abierto,
  onCerrar,
  onCreada,
  asesores,
  defaultParentId,
  defaultParentNombre,
}: ModalCrearEmpresaProps) {
  const [nombre, setNombre] = useState("");
  const [industria, setIndustria] = useState("");
  const [otraIndustria, setOtraIndustria] = useState("");
  const [sitioWeb, setSitioWeb] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [direccionFiscal, setDireccionFiscal] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [parentId, setParentId] = useState(defaultParentId || "");
  const [empresasPadre, setEmpresasPadre] = useState<{ id: string; name: string }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar lista de posibles empresas matrices si no viene fija
  useEffect(() => {
    if (abierto && !defaultParentId) {
      import("@/app/actions/empresas").then(({ listarEmpresasMin }) => {
        listarEmpresasMin().then(setEmpresasPadre).catch(() => setEmpresasPadre([]));
      });
    }
  }, [abierto, defaultParentId]);

  if (!abierto) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("El nombre de la empresa o sucursal es obligatorio.");
      return;
    }

    setGuardando(true);
    setError(null);

    const indFinal = industria === "Otra" ? otraIndustria.trim() : industria;

    const datos: DatosEmpresa = {
      name: nombre.trim(),
      industry: indFinal,
      website: sitioWeb.trim(),
      phone: telefono.trim(),
      address: direccion.trim(),
      billingAddress: direccionFiscal.trim(),
      ownerId: ownerId || null,
      parentId: defaultParentId || parentId || null,
    };

    try {
      const nueva = await crearEmpresa(datos);
      onCreada(nueva);
      onCerrar();
    } catch (err: any) {
      setError(err?.message || "Ocurrió un error al registrar la empresa.");
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
              {defaultParentNombre ? "🏬" : "🏢"}
            </span>
            <div>
              <h2 className="font-titular text-lg font-bold text-verde-profundo">
                {defaultParentNombre ? "Nueva Sucursal / Sede B2B" : "Nueva Empresa (Cuenta B2B)"}
              </h2>
              <p className="text-xs text-carbon/60">
                {defaultParentNombre
                  ? `Registra una sede dependiente de ${defaultParentNombre}`
                  : "Registra la entidad corporativa para asociar prospectos, negocios y sucursales."}
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
          <div className="mt-4 rounded-lg bg-rojo/10 p-3 text-xs text-rojo border border-rojo/20">
            {error}
          </div>
        )}

        {defaultParentNombre && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-azul/10 px-3 py-2 text-xs font-semibold text-azul border border-azul/20">
            <span>🏢</span>
            <span>Empresa Matriz: <strong>{defaultParentNombre}</strong></span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">
              {defaultParentNombre ? "Nombre de la Sucursal / Sede" : "Nombre de la Empresa"}{" "}
              <span className="text-rojo">*</span>
            </label>
            <input
              type="text"
              required
              placeholder={defaultParentNombre ? "Ej. Sucursal Centro / Planta Silao" : "Ej. Grupo Industrial del Bajío S.A. de C.V."}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
            />
          </div>

          {!defaultParentId && empresasPadre.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                ¿Es sucursal de una empresa matriz? (Opcional)
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              >
                <option value="">Ninguna (Es empresa matriz independiente)</option>
                {empresasPadre.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    🏢 {emp.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Industria / Sector
              </label>
              <select
                value={industria}
                onChange={(e) => setIndustria(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              >
                <option value="">Selecciona industria</option>
                {INDUSTRIAS_COMUNES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
              {industria === "Otra" && (
                <input
                  type="text"
                  placeholder="Especifica industria..."
                  value={otraIndustria}
                  onChange={(e) => setOtraIndustria(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-carbon/20 px-3 py-1.5 text-xs text-carbon outline-none focus:border-sauce"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Propietario / Asesor Asignado
              </label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 bg-white px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              >
                <option value="">Sin asesor asignado</option>
                {asesores.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Sitio Web
              </label>
              <input
                type="text"
                placeholder="https://empresa.com"
                value={sitioWeb}
                onChange={(e) => setSitioWeb(e.target.value)}
                className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-carbon/80 mb-1">
                Teléfono Corporativo
              </label>
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
            <label className="block text-xs font-semibold text-carbon/80 mb-1">
              Dirección Operativa / Oficinas
            </label>
            <input
              type="text"
              placeholder="Calle, Número, Colonia, Ciudad, Estado"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon/80 mb-1">
              Dirección Fiscal (Facturación)
            </label>
            <input
              type="text"
              placeholder="Razón Social, RFC o Domicilio Fiscal"
              value={direccionFiscal}
              onChange={(e) => setDireccionFiscal(e.target.value)}
              className="w-full rounded-lg border border-carbon/20 px-3 py-2 text-sm text-carbon outline-none transition focus:border-sauce focus:ring-1 focus:ring-sauce"
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
              {guardando ? "Creando..." : "Guardar Empresa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
