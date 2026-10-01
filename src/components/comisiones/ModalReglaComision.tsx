"use client";

import { useState } from "react";
import type { ReglaComision, TipoReglaComision } from "@/lib/types";
import { guardarReglaComision } from "@/app/actions/comisiones";

interface Props {
  regla?: ReglaComision | null;
  asesores: { id: string; nombre: string }[];
  alCerrar: () => void;
  alGuardar: () => void;
}

export function ModalReglaComision({ regla, asesores, alCerrar, alGuardar }: Props) {
  const [tipo, setTipo] = useState<TipoReglaComision>(regla?.tipo || "servicio");
  const [clave, setClave] = useState<string>(regla?.clave || "");
  const [etiqueta, setEtiqueta] = useState<string>(regla?.etiqueta || "");
  const [porcentaje, setPorcentaje] = useState<number>(regla ? regla.porcentaje : 5.0);
  const [montoFijo, setMontoFijo] = useState<number>(regla?.montoFijo !== undefined ? regla.montoFijo : 150.0);
  const [asesorId, setAsesorId] = useState<string>(regla?.asesorId || asesores[0]?.id || "");
  const [activo, setActivo] = useState<boolean>(regla ? regla.activo : true);
  const [notas, setNotas] = useState<string>(regla?.notas || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!etiqueta.trim()) {
      setError("Ingrese un nombre descriptivo para la regla.");
      return;
    }
    if (!clave.trim() && tipo !== "asesor") {
      setError("Ingrese una clave identificadora (ej. impermeabilizacion, general).");
      return;
    }

    try {
      setGuardando(true);
      setError(null);

      const claveFinal =
        tipo === "asesor"
          ? asesorId
          : clave.trim().toLowerCase().replace(/\s+/g, "_");

      const res = await guardarReglaComision({
        id: regla?.id,
        tipo,
        clave: claveFinal,
        etiqueta: etiqueta.trim(),
        porcentaje: tipo === "inspeccion" ? 0 : porcentaje,
        montoFijo: tipo === "inspeccion" ? montoFijo : 0,
        asesorId: tipo === "asesor" ? asesorId : null,
        activo,
        notas: notas.trim(),
      });

      if (!res.ok) {
        throw new Error(res.error || "No se pudo guardar la regla.");
      }

      alGuardar();
    } catch (err: any) {
      setError(err.message || "Error al procesar la regla.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-dorado/30 text-carbon">
        {/* Cabecera */}
        <div className="bg-verde-profundo text-crema px-6 py-4 flex items-center justify-between border-b border-dorado/30">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-widest text-dorado block">
              Parametrización
            </span>
            <h3 className="font-titular text-lg font-bold">
              {regla ? "Editar Regla de Comisión" : "Nueva Regla de Comisión"}
            </h3>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            className="text-crema/70 hover:text-crema p-1 rounded-lg transition hover:bg-crema/10"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* Tipo de Regla */}
          <div>
            <label className="block text-xs font-semibold text-carbon mb-1">
              Alcance de la Regla
            </label>
            <select
              value={tipo}
              onChange={(e) => {
                const val = e.target.value as TipoReglaComision;
                setTipo(val);
                if (val === "inspeccion" && !regla) {
                  setClave("general");
                  setEtiqueta("Comisión Fija por Inspección Técnica");
                }
                if (val === "pasarela" && !regla) {
                  setPorcentaje(4.18);
                }
              }}
              disabled={Boolean(regla?.tipo === "global")}
              className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs bg-white focus:border-verde-profundo outline-none"
            >
              <option value="inspeccion">🔍 Por Inspección Técnica Ejecutada (Tarifa Fija)</option>
              <option value="servicio">Por Tipo de Servicio (Impermeabilización, Pintura, etc.)</option>
              <option value="asesor">Especial por Asesor (Excepción personal)</option>
              <option value="producto">Por Producto de Catálogo</option>
              <option value="pasarela">💳 Tasa de Pasarela / Terminal (deducción sugerida)</option>
              {regla?.tipo === "global" && <option value="global">Regla Base General</option>}
            </select>
          </div>

          {tipo === "asesor" && (
            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Asesor
              </label>
              <select
                value={asesorId}
                onChange={(e) => {
                  setAsesorId(e.target.value);
                  const a = asesores.find((item) => item.id === e.target.value);
                  if (a && !regla) setEtiqueta(`Comisión Asesor: ${a.nombre}`);
                }}
                className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs bg-white focus:border-verde-profundo outline-none"
                required
              >
                {asesores.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {tipo !== "asesor" && tipo !== "global" && (
            <div>
              <label className="block text-xs font-semibold text-carbon mb-1">
                Clave de Sistema (Identificador)
              </label>
              <input
                type="text"
                placeholder={
                  tipo === "inspeccion"
                    ? "general o clave de inspección"
                    : tipo === "pasarela"
                    ? "ej. clip, bancaria, mercadopago"
                    : "ej. impermeabilizacion, losa, CAT-001"
                }
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs font-mono focus:border-verde-profundo outline-none"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-carbon mb-1">
              Nombre Descriptivo / Etiqueta
            </label>
            <input
              type="text"
              placeholder={
                tipo === "inspeccion"
                  ? "Comisión Fija por Inspección Técnica"
                  : tipo === "pasarela"
                  ? "ej. Clip, Bancaria"
                  : "ej. Impermeabilización Acrílica 5 Años"
              }
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs focus:border-verde-profundo outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {tipo === "inspeccion" ? (
              <div>
                <label className="block text-xs font-semibold text-carbon mb-1">
                  Monto Fijo por Inspección ($ MXN)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-carbon/40 font-bold text-xs">$</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={montoFijo}
                    onChange={(e) => setMontoFijo(parseFloat(e.target.value) || 0)}
                    className="w-full border border-carbon/20 rounded-xl pl-7 pr-3 py-2 text-sm font-mono font-bold text-verde-profundo focus:border-verde-profundo outline-none"
                    required
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-carbon mb-1">
                  {tipo === "pasarela" ? "Tasa sobre el total, con IVA (%)" : "Porcentaje (%)"}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={porcentaje}
                    onChange={(e) => setPorcentaje(parseFloat(e.target.value) || 0)}
                    className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-sm font-mono font-bold text-verde-profundo focus:border-verde-profundo outline-none"
                    required
                  />
                  <span className="absolute right-3 top-2 text-carbon/40 font-bold text-xs">%</span>
                </div>
              </div>
            )}

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                  className="w-4 h-4 rounded text-verde-profundo accent-verde-profundo"
                />
                <span>Regla Activa</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-carbon mb-1">
              Notas u Observaciones
            </label>
            <input
              type="text"
              placeholder="Condiciones en las que aplica esta regla..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className="w-full border border-carbon/20 rounded-xl px-3 py-2 text-xs focus:border-verde-profundo outline-none"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-carbon/10">
            <button
              type="button"
              onClick={alCerrar}
              className="px-4 py-2 border border-carbon/20 text-carbon/80 rounded-xl text-xs font-semibold hover:bg-slate-100 transition"
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="px-5 py-2 bg-verde-profundo text-crema rounded-xl text-xs font-bold hover:bg-verde-profundo/90 transition shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {guardando ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-crema/40 border-t-crema rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Regla"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
