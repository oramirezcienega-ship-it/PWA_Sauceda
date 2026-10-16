/**
 * Tipografía de títulos del contrato (Cormorant Garamond).
 *
 * Se carga con una hoja de estilos normal y no con next/font/google: next 14
 * la descarga en el build y truena cuando Google cambia el formato de sus URLs.
 */
export const CLASE_TITULOS_CONTRATO = "fuente-titulos-contrato";

export function FuenteContrato() {
  return (
    <style>{`
@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&display=swap");
.${CLASE_TITULOS_CONTRATO} { font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif; }
`}</style>
  );
}
