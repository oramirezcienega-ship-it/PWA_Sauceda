import type { CotizacionModularData } from "@/lib/types";
import type { ProductoSeguridad } from "@/lib/ia/catalogo-seguridad";

/**
 * Combo de seguridad como cotización modular: lo que el cliente eligió es la partida fija
 * (estructura base) y lo demás va como opcionales que el cliente prende o apaga en su enlace.
 */

const MAX_RENGLONES = 4;

const fotoDe = (p: ProductoSeguridad | undefined) => p?.fotos.find((f) => (f.tipo || "producto") === "producto") || p?.fotos[0];

function renglonesClave(p: ProductoSeguridad): string[] {
  return (p.especificaciones.trim() || p.descripcion.trim())
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•✓*·]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_RENGLONES);
}

const descripcionOpcional = (p: ProductoSeguridad) => p.descripcionValor.trim() || renglonesClave(p).join(" · ");

export function armarComboSeguridad(fijos: ProductoSeguridad[], opcionales: ProductoSeguridad[]): CotizacionModularData {
  if (fijos.length === 0) throw new Error("Elige al menos un producto como partida fija.");
  const precioBase = fijos.reduce((s, p) => s + p.precio, 0);
  const costoBase = fijos.reduce((s, p) => s + p.costo, 0);
  const titulo = fijos.length === 1 ? fijos[0].nombre : `Kit de seguridad: ${fijos.map((p) => p.nombre).join(" + ")}`;
  const foto1 = fotoDe(fijos[0]);
  // Segunda foto: el primer opcional (lo que se le sugiere) o, si no hay, el segundo producto fijo
  const segundo = opcionales[0] || fijos[1];
  const foto2 = fotoDe(segundo);
  // Opcionales de una misma familia son alternativas (se elige una); los que van solos son casillas
  const porFamilia = new Map<string, ProductoSeguridad[]>();
  for (const p of opcionales) porFamilia.set(p.familia, [...(porFamilia.get(p.familia) || []), p]);
  const grupos = Array.from(porFamilia.entries())
    .filter(([, ps]) => ps.length > 1)
    .map(([familia, productos], i) => ({ id: `grupo-${i + 1}`, familia, productos }));
  const sueltos = opcionales.filter((p) => (porFamilia.get(p.familia) || []).length === 1);

  return {
    plantillaKey: "seguridad",
    titulo: "Propuesta de seguridad SAUCEDA",
    descripcion: "Lo que elegiste ya está incluido. Agrega los complementos que te interesen y el total se actualiza al momento.",
    etiquetas: {
      fotoPrincipal: "Lo que elegiste",
      fotoSecundaria: opcionales[0] ? "Complemento sugerido" : "También incluido",
      base: "Incluido",
      baseResumen: "Lo que elegiste",
      opcionalesSeccion: "Complementos",
      opcionalesTitulo: "Agrega a tu propuesta",
    },
    estructuraBase: {
      titulo,
      precio: precioBase,
      costoFijo: costoBase,
      detalles: fijos.flatMap((p) =>
        fijos.length === 1 ? renglonesClave(p) : [`${p.nombre} — $${p.precio.toLocaleString("es-MX")}`, ...renglonesClave(p).map((l) => `  · ${l}`)]
      ),
      nota: fijos.map((p) => p.descripcionValor.trim()).filter(Boolean).join(" ") || undefined,
    },
    gruposOpciones: grupos.map((g) => ({
      id: g.id,
      titulo: g.familia,
      tipo: "radio" as const,
      notaPie: "Elige una opción o déjalo sin agregar.",
      opciones: [
        // Primera opción = selección inicial en el enlace del cliente (sin marcarla como "recomendada")
        { id: `${g.id}-sin`, nombre: `Sin ${g.familia.toLowerCase()}`, precio: 0 },
        ...g.productos.map((p) => ({ id: p.id, nombre: p.nombre, descripcion: descripcionOpcional(p), precio: p.precio, tipoPrecio: "fijo" as const })),
      ],
    })),
    complementos: sueltos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: descripcionOpcional(p),
      precio: p.precio,
      tipoPrecio: "fijo" as const,
    })),
    presets:
      opcionales.length > 0
        ? [
            { id: "eleccion", nombre: "Lo que elegiste", opciones: Object.fromEntries(grupos.map((g) => [g.id, `${g.id}-sin`])), complementos: [] },
            {
              id: "completo",
              nombre: "Con los complementos sugeridos",
              opciones: Object.fromEntries(grupos.map((g) => [g.id, g.productos[0].id])),
              complementos: sueltos.map((p) => p.id),
              recomendado: true,
            },
          ]
        : undefined,
    condiciones: {
      precios: "Precios sin factura; con factura se agrega IVA.",
    },
    fotos: {
      renderUrl: foto1?.url,
      renderTitulo: fijos[0].nombre,
      renderDescripcion: fijos[0].descripcionValor.trim() || undefined,
      estructuralUrl: foto2?.url,
      estructuralTitulo: segundo?.nombre,
      estructuralDescripcion: segundo?.descripcionValor.trim() || undefined,
    },
  };
}
