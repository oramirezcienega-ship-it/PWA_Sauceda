import { INTER_400_BASE64, INTER_700_BASE64, INTER_800_BASE64 } from "@/lib/ia/fuente-inter";
import { MAX_OPCIONES_COMPARATIVA, type FamiliaSeguridad, type ProductoSeguridad } from "@/lib/ia/catalogo-seguridad";

/**
 * Imagen comparativa de una familia de seguridad (videoporteros, cerraduras, cámaras…) para
 * enviar por WhatsApp: una tarjeta por producto con foto, precio de venta y lo que incluye.
 * Todo sale del catálogo de Productos; mismo motor que la comparativa de impermeabilización
 * (satori → SVG, sharp → PNG).
 */

const ANCHO = 1200;
const MARGEN = 54;
const SEPARACION = 20;
const VERDE = "#2D4A2B";
const VERDE_CLARO = "#5C7A52";
const DORADO = "#C9A961";
const DORADO_OSC = "#B58E3F";
const MAX_RENGLONES = 5;

type Nodo = { type: string; props: Record<string, any> };
const h = (type: string, style: Record<string, any>, children?: any, extra: Record<string, any> = {}): Nodo => ({
  type,
  props: { style: { display: "flex", ...style }, ...(children !== undefined ? { children } : {}), ...extra },
});

const dinero = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
const recortar = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

const ETIQUETA_GAMA: Record<string, string> = {
  economica: "OPCIÓN ECONÓMICA",
  media: "RECOMENDADO",
  premium: "MÁS COMPLETO",
};

/** Renglones de la ficha (sin viñetas, líneas vacías ni "Incluye instalación", que va aparte). */
function renglones(p: ProductoSeguridad): string[] {
  const base = p.especificaciones.trim() || p.descripcion.trim();
  return base
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•✓*·]\s*/, "").trim())
    .filter((l) => l && !/^incluye\s+(la\s+)?instalaci[oó]n\.?$/i.test(l));
}

function incluyeInstalacion(p: ProductoSeguridad): boolean {
  return /incluye\s+(la\s+)?instalaci[oó]n/i.test(`${p.especificaciones}\n${p.descripcion}`);
}

/** Primera foto del producto como data URI (JPEG con fondo blanco) para incrustarla en la imagen. */
async function fotoComoDataUri(p: ProductoSeguridad, ancho: number, alto: number): Promise<string | null> {
  const foto = p.fotos.find((f) => (f.tipo || "producto") === "producto") || p.fotos[0];
  if (!foto) return null;
  try {
    const res = await fetch(foto.url);
    if (!res.ok) return null;
    const sharp = (await import("sharp")).default;
    const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(ancho * 2, alto * 2, { fit: "contain", background: "#FFFFFF" })
      .flatten({ background: "#FFFFFF" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpg.toString("base64")}`;
  } catch (err) {
    console.warn(`[Seguridad] No se pudo cargar la foto de ${p.id}:`, err);
    return null;
  }
}

function tarjeta(p: ProductoSeguridad, ancho: number, foto: string | null, destacado: boolean): Nodo {
  const acento = destacado ? DORADO_OSC : VERDE_CLARO;
  const etiqueta = ETIQUETA_GAMA[p.gama] || "";
  const altoFoto = 210;
  const items = renglones(p).slice(0, MAX_RENGLONES);

  return h(
    "div",
    {
      flexDirection: "column",
      width: ancho,
      height: 640,
      padding: 20,
      borderRadius: 20,
      backgroundColor: destacado ? "#FAF7EE" : "#FFFFFF",
      border: `${destacado ? 2 : 1.5}px solid ${destacado ? DORADO : "#E2E8F0"}`,
    },
    [
      h("div", { height: 18, color: acento, fontSize: 12, fontWeight: 800 }, etiqueta || " "),
      // Foto
      h(
        "div",
        {
          marginTop: 8,
          height: altoFoto,
          borderRadius: 12,
          backgroundColor: "#FFFFFF",
          border: "1px solid #EEF2F6",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
        foto
          ? { type: "img", props: { src: foto, width: ancho - 44, height: altoFoto - 4, style: { objectFit: "contain" } } }
          : h("div", { color: "#94A3B8", fontSize: 13 }, "Foto ilustrativa próximamente")
      ),
      h("div", { color: "#0F172A", fontSize: 18, fontWeight: 800, marginTop: 12, lineHeight: 1.2, height: 44, overflow: "hidden" }, recortar(p.nombre, 70)),
      // Precio
      h("div", { alignItems: "flex-end", marginTop: 8, color: destacado ? DORADO_OSC : VERDE }, [
        h("div", { fontSize: 18, fontWeight: 800, marginBottom: 5, marginRight: 4 }, "$"),
        h("div", { fontSize: 38, fontWeight: 800, lineHeight: 1 }, dinero(p.precio)),
        h("div", { fontSize: 13, fontWeight: 800, color: "#64748B", marginLeft: 6, marginBottom: 4 }, "MXN"),
      ]),
      h(
        "div",
        { color: incluyeInstalacion(p) ? VERDE : "#64748B", fontSize: 12, fontWeight: 800, marginTop: 6 },
        incluyeInstalacion(p) ? "Incluye instalación" : "Precio del equipo"
      ),
      h("div", { height: 1, backgroundColor: "#E2E8F0", marginTop: 12, marginBottom: 10 }),
      // Características
      h(
        "div",
        { flexDirection: "column", flexGrow: 1 },
        items.map((item) =>
          h("div", { marginBottom: 5 }, [
            h("div", { width: 6, height: 6, borderRadius: 3, backgroundColor: VERDE_CLARO, marginTop: 5, marginRight: 8, flexShrink: 0 }),
            h("div", { color: "#334155", fontSize: 12, flexGrow: 1, flexShrink: 1, lineHeight: 1.25 }, recortar(item, 70)),
          ])
        )
      ),
      p.descripcionValor.trim()
        ? h(
            "div",
            {
              padding: "8px 10px",
              borderRadius: 8,
              backgroundColor: destacado ? "#FFFFFF" : "#F8FAFC",
              border: `1px solid ${destacado ? "#E2D7BE" : "#E2E8F0"}`,
              color: "#475569",
              fontSize: 11.5,
              lineHeight: 1.3,
              height: 66,
              overflow: "hidden",
            },
            recortar(p.descripcionValor.trim(), 150)
          )
        : null,
    ].filter(Boolean)
  );
}

/** Devuelve el PNG con las opciones de la familia (hasta MAX_OPCIONES_COMPARATIVA productos). */
export async function generarImagenComparativaSeguridad(familia: FamiliaSeguridad): Promise<Buffer> {
  const satori = (await import("satori")).default;
  const sharp = (await import("sharp")).default;

  const productos = familia.productos.slice(0, MAX_OPCIONES_COMPARATIVA);
  if (productos.length === 0) throw new Error(`La familia "${familia.nombre}" no tiene productos con precio.`);

  const n = productos.length;
  const anchoTarjeta = Math.min(380, Math.floor((ANCHO - MARGEN * 2 - SEPARACION * (n - 1)) / n));
  const fotos = await Promise.all(productos.map((p) => fotoComoDataUri(p, anchoTarjeta - 44, 206)));
  // Se destaca la opción de gama media ("Recomendado"), si la hay
  const destacado = productos.findIndex((p) => p.gama === "media");
  const alto = 840;

  const arbol = h(
    "div",
    { flexDirection: "column", width: ANCHO, height: alto, backgroundColor: "#F8FAFC", fontFamily: "Inter" },
    [
      h("div", { height: 118, backgroundColor: VERDE, padding: `0 ${MARGEN}px`, alignItems: "center", justifyContent: "space-between" }, [
        h("div", { flexDirection: "column" }, [
          h("div", { color: "#FFFFFF", fontSize: 32, fontWeight: 800 }, "SAUCEDA SEGURIDAD"),
          h("div", { color: DORADO, fontSize: 16, fontWeight: 800, marginTop: 6 }, `OPCIONES DE ${familia.nombre.toUpperCase()}`),
        ]),
        h(
          "div",
          { backgroundColor: VERDE_CLARO, color: "#FFFFFF", fontSize: 19, fontWeight: 800, padding: "11px 22px", borderRadius: 24 },
          `${n} ${n === 1 ? "opción" : "opciones"}`
        ),
      ]),
      h(
        "div",
        { padding: `24px ${MARGEN}px 0`, justifyContent: "center" },
        productos.map((p, i) => h("div", { marginLeft: i === 0 ? 0 : SEPARACION }, [tarjeta(p, anchoTarjeta, fotos[i], i === destacado)]))
      ),
      h(
        "div",
        { justifyContent: "center", marginTop: 18, color: "#64748B", fontSize: 13 },
        "Precios sin factura (con factura se agrega IVA) · Imágenes ilustrativas"
      ),
    ]
  );

  const fuente = (b64: string) => Buffer.from(b64, "base64");
  const svg = await satori(arbol as any, {
    width: ANCHO,
    height: alto,
    fonts: [
      { name: "Inter", data: fuente(INTER_400_BASE64), weight: 400, style: "normal" },
      { name: "Inter", data: fuente(INTER_700_BASE64), weight: 700, style: "normal" },
      { name: "Inter", data: fuente(INTER_800_BASE64), weight: 800, style: "normal" },
    ],
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
}
